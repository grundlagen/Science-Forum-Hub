# Science-Forum-Hub extrapolator — session resume brief

Paste this whole file into a new Claude Code / Terminal session (any account) to pick up cold.

## What this project is

A qui-tam / False Claims Act extrapolator for US-federally-funded research fraud. It ingests
open public data (OpenAlex, NIH RePORTER, USASpending, CMS, OIG, SAM, Retraction Watch, PMC-OA),
runs deterministic + statistical detectors, and emits attorney-grade leads. Non-negotiable rules:

- Evidence-led, not identity-led (see `.claude/memory/feedback_discovery_design.md` in user memory).
- Every signal is a lead for human review, never a fraud finding.
- Deterministic-arithmetic detectors (GRIM/SPRITE/Benford) rank above statistical ones because
  they produce evidence a lawyer can put in a filing.

## Repository

`/home/mint/Science-Forum-Hub`, branch **`claude/building-thoughts-r6ghup`**.
GitHub: https://github.com/grundlagen/Science-Forum-Hub (PAT is embedded in the local remote URL, ok).

Key directories:

- `lib/extrapolator/` — TypeScript pipeline (Node/pnpm workspace)
- `lib/integrations/` — {nih-reporter, openalex, usaspending, sam-exclusions, oig-leie, cms, ocds, sba-ppp, semantic-scholar}
- `services/text-forensics/` — Python side (this is where all current work sits)
- `services/image-forensics/` — Python image dup detection (paused, DINOv2 index)
- `docs/research-integrity/` — MASTER-SPEC, COST-AND-MOAT, CASE-LAW-DISCOVERY-METHODS, DEBIAS-REASONING, RUNBOOK

## Runtime environment

- **Vast.ai RTX 4090 box**: `ssh -p 3401 -i ~/.ssh/id_ed25519_vast root@117.50.76.44`
  - 16 GB overlay `/` (5 GB free — TIGHT), 31 GB `/dev/shm` (RAM tmpfs, use for scratch), 500 GB RAM
  - Repo at `/workspace/sfh`, venv at `/venv/main` (`source /venv/main/bin/activate`)
  - **China network**: HuggingFace direct is blocked; use `HF_ENDPOINT=https://hf-mirror.com`
  - `git fetch` sometimes flakes on first try; retry loop of 3 works
- **Google Drive rclone**: `gdrive:` remote works locally + on vast box (conf pushed via scp).
  Local: `/home/mint/.config/rclone/rclone.conf`. Box: `/root/.config/rclone/rclone.conf`.
  Push results to `gdrive:sfh/` (5 TB free). Compute against local disk, not Drive.

## Data corpora status

- **OpenAlex US-federal-funded works (2015+)** — 800k target, streaming to `/dev/shm/text-run/works.jsonl` on box.
  Multi-funder: NIH F4320337354, NSF F4320306076, DoE F4320337395, DoD F4320337394, NASA F4320306084,
  USDA F4320306138, CDC F4320306106.
- **NIH RePORTER grant abstracts (2015-2025)** — 1.5M cap, streaming to `/workspace/mega/reporter/grants.jsonl`.
- **Retraction Watch DOI list** — via Crossref labs, saved to `/dev/shm/text-run/retracted_dois.txt`.
- **PMC-OA full text** (Europe PMC BioC XML, section-labelled passages) — for FCA-relevant sections
  (METHODS technique reuse, INTRO motivation reuse, RESULTS outcome claim reuse). Waits for works.jsonl,
  streams to `/workspace/mega/reporter/passages.jsonl`.

## Running processes on the vast box (as of 2026-07-04, mega + scale_run kicked off in that session)

Check with: `ssh ... 'ps aux | grep -E "python|rclone|mega|scale_run" | grep -v grep'`.

- **scale_run.sh** — OpenAlex fetch → SPECTER2 embed on 4090 → HNSW32 scan → RW join → `/workspace/text-run-02/`
- **fetch_reporter.py** — RePORTER grants, ~1M projects
- **tortured_phrase.py loop** — Cabanac/Labbé PPS regex, 5-min cycle, `/workspace/mega/tortured/leads.jsonl`
- **retraction_cluster.py loop** — PIs w/ ≥2 retractions still receiving awards, 15-min cycle,
  `/workspace/mega/cluster/retraction_pis.json`
- **RePORTER embed** — waits until scale_run GPU free + 50k grants ready → SPECTER2 embed
- **rclone push-loop** — every 10 min, `/workspace/mega` + `/workspace/text-run-02` → `gdrive:sfh/`
- **fetch_europepmc_fulltext.py** — passage-level full text (waits for works.jsonl)
- **analytics loop** — Benford + duplicate-claim + velocity, 30-min cycle → `/workspace/mega/cluster/*.json`

Nothing depends on the Claude session — everything is `nohup`ed detached. Session death is safe.

## Detector inventory

### Built and running
- SPECTER2 abstract embedding + HNSW cross-award near-dup (`hnsw_scan.py`)
- Cross-author high-cosine + jaccard6 lexical verification (`hnsw_scan.py --jaccard-min`)
- Retraction Watch DOI join (`fetch_retractions.py`)
- Tortured-phrase scanner (`tortured_phrase.py`)
- Retraction-cluster PI analysis (`retraction_cluster.py`)
- Benford first + last-digit chi² per author (`benford.py`)
- Duplicate-claim / multi-funder acknowledgement (`duplicate_claim.py`)
- Velocity: papers/$, papers/year, dollar-concentration (`velocity.py`)
- Full-text Europe PMC BioC fetcher (`fetch_europepmc_fulltext.py`)

### Not yet built — TODO in priority order
1. **GRIM / SPRITE arithmetic-consistency detectors** — parse `mean (SD), n=X` triples from passages,
   check whether mean is achievable given N for integer-valued data. Deterministic, attorney-grade.
   Depends on passages.jsonl (full text) being non-empty.
2. **Grant-vs-paper cross-search** — after both SPECTER2 embed passes finish, FAISS cross-search
   RePORTER grant-abstract vectors against paper vectors, filter to same-PI matches, jaccard verify.
   This is the *real* FCA text-reuse axis (paper-vs-paper failed because OpenAlex abstracts are
   polluted by shared journal editor summaries — see Run 01 findings in memory).
3. **Time-series break detection** on per-PI Benford/velocity fingerprints — sudden shift often
   coincides with personnel change or funding pressure.
4. **Entity-resolution / link analysis** — shared corresponding-author emails, addresses,
   ORCID clustering; extend `lib/extrapolator/src/resolvePi.ts` and `linkage.ts`.
5. **PubPeer flagged-DOI scrape** — supplement Retraction Watch with in-flight community flags.
6. **CMS Open Payments × NIH-PI cross-check** — Phillips & Cohen playbook (physician-PIs receiving
   big pharma money while running NIH-funded trials).
7. **Image-forensics** — resume DINOv2 + BioFors benchmark path (see EXISTING-SYSTEMS-AND-ADOPTION.md).
   Full ImageTwin-parity index is €300-1500/mo; test-scale is €10-50/mo. Skip for now.

## Key findings from Run 01 (2026-07-04)

50k NIH-funded OpenAlex works at threshold 0.94 produced 200k pairs; almost all noise:
- Same-author high-cosine dominated by legit v2/update pairs (MitoCarta 2→3 etc).
- Cross-author high-cosine had ~0% lexical overlap — parallel semantic content, not text plagiarism.
- The 144 jaccard6≥0.15 pairs were **all** OpenAlex abstract pollution:
  shared Science/Nature editor-summary text indexed as the abstract for every paper in a themed issue.
  Plazi placeholders. Same-lab boilerplate openings.

**Conclusion: paper-vs-paper abstract text-reuse is the wrong axis.**
Real FCA axis: grant proposal abstract vs paper Methods/Results **by same PI**. That is what Run 02
(mega_run + scale_run + RePORTER + full-text) is set up to enable.

## How to check status in a new session

```bash
# SSH probe
ssh -p 3401 -i ~/.ssh/id_ed25519_vast root@117.50.76.44 \
  'tail -1 /workspace/text-run-02/logs/run.log; ls /workspace/text-run-02/; wc -l /dev/shm/text-run/works.jsonl /workspace/mega/reporter/grants.jsonl /workspace/mega/reporter/passages.jsonl 2>/dev/null; ls /workspace/mega/cluster/'

# See what workers are alive
ssh ... 'ps aux | grep -E "python|rclone" | grep -v grep'

# Pull results local
scp -P 3401 -i ~/.ssh/id_ed25519_vast \
    root@117.50.76.44:'/workspace/mega/cluster/*.json /workspace/text-run-02/leads_summary.json' \
    /home/mint/Science-Forum-Hub/runs/text-run-02/

# Or read from Google Drive
rclone lsd gdrive:sfh/
rclone copy gdrive:sfh/mega/cluster/ /home/mint/Science-Forum-Hub/runs/mega-cluster/
```

## User memory (loaded automatically in Claude sessions on this machine)

`/home/mint/.claude/projects/-home-mint/memory/`:
- `project_science_forum_hub.md` — high-level project brief
- `project_science_forum_hub_embed_plan.md` — this run's checkpoint (Run 01 findings + Run 02 config)
- `reference_quitam_operators.md` — Constantine Cannon / Phillips & Cohen / Kirby McInerney playbooks
- `feedback_discovery_design.md` — evidence-led seeding rule (reject nationality/co-affiliation)
- `feedback_token_saving.md` — terse caveman style
- `feedback_session.md` — autonomous operation, bypass permissions

If loading in a fresh account without that memory dir, this RESUME.md contains enough to restart.

## User contact

rupertwmurphy@gmail.com — the OPENALEX_MAILTO / retraction-watch politeness header.

## Style expectations

Caveman-terse in updates. Tool-first, result-first. No preamble. No filler. Autonomous mode: kick
things off in the background, don't ask before non-destructive actions. Explain arithmetic-quality
of any FCA finding (deterministic > statistical > semantic).
