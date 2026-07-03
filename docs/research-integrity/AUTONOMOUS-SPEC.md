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

## Colab Pro runbook

```python
# 1. clone + deps (Colab Pro GPU)
!nvidia-smi -L
!git clone --branch claude/building-thoughts-r6ghup https://github.com/grundlagen/science-forum-hub.git
%cd science-forum-hub
!npm i -g pnpm && pnpm install
!pip -q install opencv-python-headless imagehash pillow numpy faiss-cpu torch torchvision
!pip -q install google-generativeai   # for the Gemini self-edit backend

# 2. persist the corpus/index on your 5TB Drive so sessions resume
from google.colab import drive; drive.mount('/content/drive')
!mkdir -p /content/drive/MyDrive/Research_Integrity_Runs/corpus
!ln -sfn /content/drive/MyDrive/Research_Integrity_Runs/corpus services/image-forensics/corpus

# 3. keys (least privilege; never paste in chat) + git push identity
import os; os.environ['GOOGLE_API_KEY'] = 'YOUR_GEMINI_KEY'
!git config user.email you@example.org && git config user.name colab-runner
from getpass import getpass; tok = getpass('GitHub PAT (contents:write only): ')
!git remote set-url origin https://x-access-token:{tok}@github.com/grundlagen/science-forum-hub.git

# 4. sanity: the deterministic logic passes offline
!python services/autonomy/selftest.py

# 5. launch the autonomous loop (self-edits ON because GOOGLE_API_KEY is set)
!cd services/autonomy && python orchestrator.py \
    --harvest 'GRANT_AGENCY:"NIH" AND OPEN_ACCESS:y' --harvest-n 2000 \
    --budget-hours 8 --max-iterations 50 --patience 5
```

Watch `services/image-forensics/runs/STATUS.md` on the branch. When it stops on a
plateau, read the STATUS + log, give it a new direction (edit `milestones.py` targets or
tell the next run what to focus on), and relaunch — that's the "changes in direction"
part of the loop.

## Guardrails you (and any LLM) must not remove
- The test gate is the arbiter; keep it in the loop.
- The invariants in `guard.py` are load-bearing — country/identity-neutral,
  signals-not-verdicts, no committed secrets.
- The loop never contacts anyone or files anything; `filing_ready` means "worth a
  counsel meeting," and counsel owns seal / first-to-file / original-source.
- Use a least-privilege, short-lived PAT and rotate it after the run.
