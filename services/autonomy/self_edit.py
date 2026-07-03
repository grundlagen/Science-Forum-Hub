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

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

from test_gate import run_gate, GateResult


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


class GeminiBackend(LLMBackend):
    name = "gemini"

    def available(self) -> bool:
        return bool(os.environ.get("GOOGLE_API_KEY"))

    def propose(self, prompt: str) -> EditProposal | None:  # pragma: no cover - network
        # WIRING POINT: call google-generativeai, parse a strict JSON response of the
        # form {"rationale": str, "files": [{"path": str, "content": str}]}.
        raise NotImplementedError("wire google-generativeai here")


class ClaudeBackend(LLMBackend):
    name = "claude"

    def available(self) -> bool:
        return bool(os.environ.get("ANTHROPIC_API_KEY"))

    def propose(self, prompt: str) -> EditProposal | None:  # pragma: no cover - network
        # WIRING POINT: call the Anthropic SDK, same strict JSON contract.
        raise NotImplementedError("wire anthropic SDK here")


def get_backend() -> LLMBackend:
    for b in (GeminiBackend(), ClaudeBackend()):
        if b.available():
            return b
    return LLMBackend()


def _git(root: Path, *args: str) -> tuple[int, str]:
    p = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def apply_and_gate(root: Path, proposal: EditProposal) -> tuple[bool, GateResult]:
    """Apply a proposal, run the gate, and REVERT if not green. Returns (kept, result).

    Precondition: the working tree is clean (the orchestrator commits results before
    proposing an edit), so revert is a simple restore to HEAD.
    """
    for rel, content in proposal.files:
        fp = root / rel
        fp.parent.mkdir(parents=True, exist_ok=True)
        fp.write_text(content)

    result = run_gate(root)
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
