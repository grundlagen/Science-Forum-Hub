# Autonomous build loop — spec, safety, and the Colab runbook

*How the project drives itself toward completion on Colab Pro, unattended, with a
guarded self-editing code loop and an honest cost-benefit readout. Not legal advice;
outputs are leads for human review.*

## What "autonomous" honestly means here

The editor (an LLM) cannot sit in a loop for hours. So the loop's brain lives **inside
Colab**: `services/autonomy/orchestrator.py` runs the pipeline, evaluates the spec,
and — if an LLM API key is configured — asks that LLM for one code change toward the
current milestone, tests it, and keeps it only if the whole suite stays green. You start
it once; it runs until the spec is met, the budget runs out, or it plateaus.

Two brains, clearly separated:
- **Muscle + arbiter (Colab):** runs everything, and the *test gate* is the final judge.
- **Proposer (LLM API):** Gemini (your Google AI key) or Claude — only ever *proposes*;
  never has unmediated write access.

## The spec = measurable milestones (`milestones.py`)

The loop is "done" when all of these numeric criteria hold — no vibes:

1. `build_green` — typecheck + every test suite pass
2. `invariants_intact` — country/identity-neutral, signals-not-verdicts (guarded)
3. `detector_validated` — ≥1 detector has measured precision/recall
4. `corpus_scale` — ≥1,000,000 panels indexed
5. `image_quality` — BioFors recall ≥0.85 and FP-rate ≤0.05
6. `leads_found` — ≥1 ORB-confirmed cross-article duplication lead
7. `filing_ready` — ≥1 candidate clears the FOCUS pre-filing gate
8. `positive_roi` — expected value ≥3× run cost

The loop always works the **first unmet** milestone.

## The safety gate (`test_gate.py` + `guard.py`)

No self-edit is ever kept unless, after applying it, ALL of this is still true:
- `pnpm run typecheck` passes;
- all 18 `verify-*` suites pass;
- the Python image benchmarks pass;
- **invariants hold** — the guard reads the actual source and fails the gate if a
  nationality score reappears, the identity gate or corroboration cap is removed, or a
  secret is hard-coded.

If the gate is not green, the edit is hard-reverted (`git checkout -- .`). The model
optimises within the guardrails; it cannot delete them (proven by `selftest.py`, which
reintroduces a `HIGH_RISK_COUNTRIES` list and asserts the guard catches it).

## Stop conditions (so it can't burn budget)
- spec complete;
- GPU budget hours exceeded (`--budget-hours`);
- **plateau**: `--patience` iterations with no milestone gain → stop and ask for a human
  steer (a direction change). This is where you redirect it.

Every iteration appends to `runs/autonomy_log.jsonl` and rewrites `runs/STATUS.md`
(spec status + cost-benefit), and pushes to the branch — so you can watch from anywhere.

## Cost-benefit (`cost_benefit.py`)
Transparent, conservative EV: `cost` (GPU + storage + LLM calls + analyst hours) vs
`benefit` (confirmed leads × P(real) × P(filed) × P(recovery) × settlement × relator
share, grounded in the Dana-Farber $15M/$2.625M exemplar but using a $5M settlement and
17.5% share). It's a planning aid, not a promise — every assumption is in the output.

## Simplest launch — TWO cells (do not curl a private repo's raw content)

**Why not `curl raw.githubusercontent.com | bash`:** that endpoint needs its own auth,
and a URL-embedded PAT does not work there for a private repo — you get a 404 body and
bash tries to *execute* it (`404:: command not found`). `git clone` with a PAT DOES work
for private repos (it's a different, correct auth path), so always clone first, then run
the script from the local checkout.

**Before running:** put your secrets in Colab's Secrets manager (padlock icon in the
left sidebar) — do NOT hardcode them in a cell. Recommended names: `GITHUB_PAT`,
`OPENROUTER_API_KEY` (the loop reads these automatically at startup via
`load_colab_secrets()` — no manual `os.environ[...] = 'YOUR_PAT'` copy-paste, which is
exactly the class of mistake that leaves a literal placeholder string in place).

**Cell 1 — mount Drive, clone, install, preflight, launch in the BACKGROUND:**
```python
from google.colab import drive, userdata
drive.mount('/content/drive')
import os
for k in ("GITHUB_PAT", "OPENROUTER_API_KEY"):
    try: os.environ[k] = userdata.get(k)
    except Exception: pass

pat = os.environ.get("GITHUB_PAT", "")
repo_dir = "/content/drive/MyDrive/science-forum-hub"
if not os.path.isdir(repo_dir + "/.git"):
    !git clone --branch claude/building-thoughts-r6ghup \
        https://x-access-token:{pat}@github.com/grundlagen/science-forum-hub.git {repo_dir}
%cd {repo_dir}
os.environ["PYTHON_ONLY"] = "1"   # skip Node/pnpm if it's been flaky; drop this once pnpm is solid
os.environ["BACKGROUND"] = "1"    # cell returns immediately; NO hand-rolled background thread needed
!bash services/autonomy/colab_bootstrap.sh
```
This is LOUD by design: `preflight.py` round-trips a probe file to prove Drive is
writable, checks GPU/deps/git/network, and **stops with a clear reason** instead of
running silently if anything critical is broken. `BACKGROUND=1` launches the loop as a
detached OS process (not a Python thread — Colab's own `google.colab.ai` hooks are
documented to crash inside background threads, so don't hand-write one; a separate
process has no such problem) and returns the cell immediately with a PID.

**Cell 2 — check status any time (re-run this cell whenever you want an update, instead
of a supervisor thread):**
```python
!tail -n 60 /content/drive/MyDrive/Research_Integrity_Runs/console.log
print("\n" + "="*60)
!cat /content/drive/MyDrive/Research_Integrity_Runs/STATUS.md
```

Two things that caused "no output / nothing saved" before, now handled:
- **Output buffering** — the loop prints timestamped heartbeats each phase, and the
  launcher forces unbuffered output (`python -u`, `stdbuf`).
- **Drive persistence** — `RI_RUNS_DIR` points at `/content/drive/MyDrive/
  Research_Integrity_Runs`; `STATUS.md`, `autonomy_log.jsonl`, and `console.log` persist
  there every iteration, and the repo itself lives on Drive so a new session **reuses
  it** (no re-clone/re-install).

The default deep scan harvests across **NIH + NSF + DoD + DoE** open-access papers
(`HARVEST_N=3000`, override via `os.environ["HARVEST_N"]` before the bootstrap call).

## Self-edit backend — what actually works, and what to avoid

**Do NOT hand-write a cell using `google.generativeai`.** Colab's own runtime prints a
deprecation notice for it ("All support... has ended"); it is fully end-of-life. And do
NOT hand-roll a background thread that calls `google.colab.ai` — those hooks are not
safe to call from a background thread and will crash. Both mistakes are already fixed in
`self_edit.py` / `colab_bootstrap.sh`; you should never need to write either by hand.

**Recommended: OpenRouter.** One key (`OPENROUTER_API_KEY`, which you already have in
Secrets) reaches any top coding model — no deprecated SDK, no thread issues. Pick the
model with `os.environ['OPENROUTER_MODEL']` before launch (current strong picks, July
2026): `anthropic/claude-opus-4.8` or `openai/gpt-5.5` for depth, `anthropic/claude-sonnet-4.6`
or `deepseek/deepseek-v4` for cheap-and-good, `qwen/qwen3-coder` for open-weight.
Default if unset: `anthropic/claude-sonnet-4.6`.

**Verify the backend works before trusting it:** the orchestrator runs
`smoke_test_backend()` at startup and prints `PASS`/`FAIL` — if you see `FAIL`, self-edits
are automatically disabled for that run (metrics/scan still proceed), so a broken key
never silently wastes the whole run. You can also check standalone:
```python
from self_edit import get_backend, smoke_test_backend
print(smoke_test_backend(get_backend()))
```

If you'd rather use Gemini directly, the current SDK is `google-genai` (`pip install
google-genai`), NOT `google-generativeai` — `GeminiBackend` already uses the correct one.

When it stops on a plateau, read STATUS.md + the log, give it a new direction (edit
`milestones.py` targets, change `HARVEST_QUERY`, or swap `OPENROUTER_MODEL`), and
relaunch — that's the "changes in direction" part of the loop.

## Guardrails you (and any LLM) must not remove
- The test gate is the arbiter; keep it in the loop.
- The invariants in `guard.py` are load-bearing — country/identity-neutral,
  signals-not-verdicts, no committed secrets.
- The loop never contacts anyone or files anything; `filing_ready` means "worth a
  counsel meeting," and counsel owns seal / first-to-file / original-source.
- Use a least-privilege, short-lived PAT and rotate it after the run.
