# Research-Integrity Extrapolator

An additive subsystem inside this monorepo that turns **public** research + grant data
into ranked, provenance-backed integrity / disclosure **signals**, packaged for US
False Claims Act (FCA) counsel and the DOJ **FOCUS** data-miner program.

> **Signals, not verdicts.** Output is ranked *probable cause* with a confidence and a
> reason — never "proof of fraud." The decisive document (e.g. an NIH "Other Support"
> page) is usually non-public. **Not legal advice.**

## Status

- **M0 — scaffold + canonical schema + connectors + slice:** done.
- **M1 — Pipeline B foreign-funding mismatch detector + validation harness:** done;
  **v2 is country-neutral by design** (corroboration-only scoring, see
  `DEBIAS-REASONING-AND-FORUM.md`).
- **M2+ — general-award, healthcare, dedupe, sub-award detectors + case packages:** done.
- **Construction/procurement wave (from case law):** copied-test-data (Kokosing
  pattern), bid-rigging screens (CV/RD/rotation), DBE pass-through fronts, PPP
  anomalies, GRIM/Benford/terminal-digit fabrication stats — see
  `CASE-LAW-DISCOVERY-METHODS.md` for the case-to-detector map.
- **Image forensics:** within-corpus detector (pHash/ORB/flips/copy-move) plus panel
  segmentation and a cross-literature embedding index (`services/image-forensics`);
  offline benchmarks green (`stress_test.py`, `index_test.py`).
- **Verified:** full workspace `pnpm run typecheck` + 15 offline verify suites pass.
- **Network note:** live API calls (NIH RePORTER, OpenAlex, USASpending, Europe PMC)
  need outbound access; some sandbox egress policies block them (you'll see `HTTP 403`).
- **Network note:** the NIH RePORTER and OpenAlex calls need outbound access to those
  public APIs; some sandbox egress policies block them (you'll see `HTTP 403`).

## Packages

- **`@workspace/db` → `src/schema/integrity/`** — canonical `ri_*` tables
  (researchers, institutions, funders, grants, works + links), plus legal-by-design
  hooks: `ri_provenance` (+ `public_as_of`), `ri_original_source_log`,
  `ri_cases.disclosure_state`, `match_confidence`, and a labelled `ri_ground_truth_cases`.
- **`@workspace/integration-nih-reporter`** — NIH RePORTER v2 client (zod-validated).
- **`@workspace/integration-openalex`** — OpenAlex works/author/funder client (entity-resolution backbone).
- **`@workspace/integration-usaspending` / `-sam-exclusions` / `-oig-leie` / `-cms` /
  `-ocds` / `-sba-ppp`** — general-award, exclusion, healthcare, procurement (50+
  countries) and PPP loan-level data (pure parsers where the source is a bulk CSV).
- **`@workspace/extrapolator`** — resolver + linkage + provenance helpers; detectors
  (foreign-funding v2, debarred recipient/sub, excluded provider, dedupe/shell,
  copied-test-data, bid-rigging screens, pass-through fronts, PPP anomalies,
  fabrication stats); corroboration layer; ethics triage; case packages; 15 offline
  verify suites; scan CLIs.
- **`services/image-forensics`** — duplication detector, panel segmentation,
  cross-literature embedding index + Europe PMC figure harvester (see
  `DATA-COLLECTION.md`).

## Run

```bash
pnpm install
pnpm run typecheck                      # verify the whole workspace

# M0 org -> grants -> works slice (dry-run, no DB):
pnpm --filter @workspace/extrapolator run slice -- \
  --org "Dana-Farber Cancer Institute" --ror https://ror.org/02jzgtq86

# M1 foreign-funding detector for one PI (needs network to NIH/OpenAlex):
OPENALEX_MAILTO=you@example.org \
  pnpm --filter @workspace/extrapolator run detect-foreign-funding -- "Qing Wang" --funders

# M1 validation harness (precision/recall vs the labelled ground-truth set):
OPENALEX_MAILTO=you@example.org \
  pnpm --filter @workspace/extrapolator run validate-foreign-funding

# Persisting to Postgres (optional):
pnpm --filter @workspace/db run push
DATABASE_URL=... pnpm --filter @workspace/extrapolator run seed-ground-truth
```

Set `OPENALEX_MAILTO` for OpenAlex's polite pool.

## Roadmap

- **M1.1 — UKRI (Gateway to Research) + CORDIS connectors** so funder-based (not just
  affiliation-based) foreign evidence fires; expand the labelled validation set with
  confirmed PI names + clean controls.
- **M2 — certification chain** (NIH ExPORTER link tables: paper → grant → PI → false
  certification — the legally decisive layer).
- **M3 — Pipeline A images** (open-source within-corpus duplication, see
  `services/image-forensics`; ImageTwin optional augmentation).

See `MASTER-SPEC.md` for the full design, open decisions, and the do-not-reintroduce list;
`COST-AND-MOAT.md` for the image build-vs-buy analysis.
