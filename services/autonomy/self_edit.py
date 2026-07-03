"""
Guarded self-editing. An LLM (Gemini via the user's Google AI key, or Claude) proposes
a code change aimed at the current milestone; we apply it on a scratch commit, run the
FULL gate, and keep it ONLY if the gate stays green. Otherwise we hard-revert. The LLM
never has unmediated write access — the test gate is the arbiter, not the model.

Backends are pluggable and unavailable until a key is configured, so the module imports
and self-tests offline. Wire a backend by setting GOOGLE_API_KEY (Gemini) or
ANTHROPIC_API_KEY (Claude).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from test_gate import run_gate, GateResult

# Self-edits may only touch these path prefixes. In python_only mode this is further
# narrowed to .py files, so the loop can improve the scan code without a working TS
# toolchain. An LLM cannot write outside this whitelist (enforced in apply_and_gate).
ALLOWED_EDIT_PREFIXES = ("services/image-forensics/", "services/autonomy/", "lib/extrapolator/src/")


def parse_proposal(text: str) -> "EditProposal | None":
    """Extract the strict-JSON contract from an LLM reply (tolerant of code fences)."""
    if not text:
        return None
    m = re.search(r"\{.*\}", text, re.DOTALL)  # first '{' .. last '}'
    if not m:
        return None
    try:
        obj = json.loads(m.group(0))
        files = [(f["path"], f["content"]) for f in obj.get("files", [])
                 if isinstance(f.get("path"), str) and isinstance(f.get("content"), str)]
        if not files:
            return None
        return EditProposal(rationale=str(obj.get("rationale", "")), files=files)
    except Exception:  # noqa: BLE001
        return None


def path_allowed(rel: str, python_only: bool) -> bool:
    rel = rel.lstrip("/")
    if ".." in rel or not rel.startswith(ALLOWED_EDIT_PREFIXES):
        return False
    return rel.endswith(".py") if python_only else True


@dataclass
class EditProposal:
    rationale: str
    # list of (relative_path, full_new_contents). Whole-file replacement keeps apply
    # deterministic and easy to revert — no fuzzy patching.
    files: list[tuple[str, str]]


class LLMBackend:
    name = "none"

    def available(self) -> bool:
        return False

    def propose(self, prompt: str) -> EditProposal | None:  # pragma: no cover - network
        raise NotImplementedError


class OpenRouterBackend(LLMBackend):
    """OpenRouter (OpenAI-compatible) — one key, any top coding model. Recommended for
    self-editing: set OPENROUTER_MODEL to a frontier coder. Good picks (July 2026):
      anthropic/claude-opus-4.8, openai/gpt-5.5, google/gemini-3-pro   (frontier)
      anthropic/claude-sonnet-4.6, deepseek/deepseek-v4                 (cheap+good)
      qwen/qwen3-coder, moonshotai/kimi-k2.6                            (open-weight)
    """

    name = "openrouter"
    endpoint = "https://openrouter.ai/api/v1/chat/completions"

    def available(self) -> bool:
        return bool(os.environ.get("OPENROUTER_API_KEY"))

    def propose(self, prompt: str) -> EditProposal | None:  # pragma: no cover - network
        import urllib.request

        model = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-sonnet-4.6")
        body = json.dumps({
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 8000,
            "temperature": 0.2,
        }).encode()
        req = urllib.request.Request(
            self.endpoint, data=body,
            headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}",
                     "Content-Type": "application/json",
                     "X-Title": "research-integrity-autonomy"},
        )
        with urllib.request.urlopen(req, timeout=180) as r:
            data = json.loads(r.read())
        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return parse_proposal(text)


class ColabAIBackend(LLMBackend):
    """Colab's built-in model via `from google.colab import ai` — no API key needed.
    This is the default self-edit brain on Colab."""

    name = "colab-ai"

    def available(self) -> bool:
        try:
            from google.colab import ai  # noqa: F401
            return True
        except Exception:
            return False

    def propose(self, prompt: str) -> EditProposal | None:  # pragma: no cover - Colab only
        from google.colab import ai

        text = ai.generate_text(prompt)
        return parse_proposal(text if isinstance(text, str) else str(text))


class GeminiBackend(LLMBackend):
    name = "gemini"

    def available(self) -> bool:
        return bool(os.environ.get("GOOGLE_API_KEY"))

    def propose(self, prompt: str) -> EditProposal | None:  # pragma: no cover - network
        import google.generativeai as genai

        genai.configure(api_key=os.environ["GOOGLE_API_KEY"])
        model = genai.GenerativeModel(os.environ.get("GEMINI_MODEL", "gemini-1.5-pro"))
        resp = model.generate_content(prompt)
        return parse_proposal(getattr(resp, "text", "") or "")


class ClaudeBackend(LLMBackend):
    name = "claude"

    def available(self) -> bool:
        return bool(os.environ.get("ANTHROPIC_API_KEY"))

    def propose(self, prompt: str) -> EditProposal | None:  # pragma: no cover - network
        import anthropic

        client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY
        msg = client.messages.create(
            model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5"),
            max_tokens=8000,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
        return parse_proposal(text)


def get_backend() -> LLMBackend:
    # Prefer OpenRouter (any top coding model via one key) > direct keyed APIs >
    # Colab's built-in AI (free fallback).
    for b in (OpenRouterBackend(), GeminiBackend(), ClaudeBackend(), ColabAIBackend()):
        if b.available():
            return b
    return LLMBackend()


def smoke_test_backend(backend: LLMBackend) -> tuple[bool, str]:
    """Confirm the LLM backend actually returns a parseable edit proposal before the
    loop relies on it. Returns (ok, detail)."""
    if not backend.available():
        return False, f"backend '{backend.name}' not available"
    probe = (
        'Reply with ONLY this JSON and nothing else: '
        '{"rationale":"smoke test","files":[{"path":"services/autonomy/_smoke.py","content":"# ok\\n"}]}'
    )
    try:
        prop = backend.propose(probe)
    except Exception as e:  # noqa: BLE001
        return False, f"{backend.name} raised: {e}"
    if prop is None:
        return False, f"{backend.name} returned no parseable JSON proposal"
    return True, f"{backend.name} OK ({len(prop.files)} file(s) parsed from a probe)"


def _git(root: Path, *args: str) -> tuple[int, str]:
    p = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def apply_and_gate(root: Path, proposal: EditProposal, python_only: bool = False) -> tuple[bool, GateResult]:
    """Apply a proposal, run the gate, and REVERT if not green. Returns (kept, result).

    Rejects (without running anything) any proposal that touches a path outside the
    allowlist. Precondition: the working tree is clean (the orchestrator commits results
    before proposing an edit), so revert is a simple restore to HEAD.
    """
    bad = [rel for rel, _ in proposal.files if not path_allowed(rel, python_only)]
    if bad:
        res = GateResult()
        res.failures.append(f"proposal touched disallowed path(s): {bad}")
        return False, res

    for rel, content in proposal.files:
        fp = root / rel
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(content)

    result = run_gate(root, python_only=python_only)
    if result.green:
        _git(root, "add", "-A")
        _git(root, "commit", "-m", f"autonomy: {proposal.rationale[:72]}")
        return True, result
    # revert: discard tracked changes and remove any new files the proposal added
    _git(root, "checkout", "--", ".")
    _git(root, "clean", "-fd", "services", "lib")
    return False, result


def build_prompt(milestone_desc: str, metrics: dict, repo_digest: str) -> str:
    return (
        "You are improving a research-integrity / qui-tam detection codebase toward one "
        "measurable milestone. Return ONLY strict JSON: "
        '{"rationale": str, "files": [{"path": str, "content": str}]}.\n\n'
        f"CURRENT MILESTONE: {milestone_desc}\n"
        f"CURRENT METRICS: {metrics}\n\n"
        "HARD RULES (a violation means your change is auto-reverted):\n"
        "- Keep every test green; add tests for new logic.\n"
        "- Never score on nationality/country; never remove the identity gate or the "
        "single-source corroboration cap; outputs are probable cause, not verdicts.\n"
        "- No hard-coded secrets.\n\n"
        f"REPO DIGEST:\n{repo_digest}\n"
    )
