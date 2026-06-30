# Research-Integrity Extrapolator

An additive subsystem inside this monorepo that turns **public** research + grant data
into ranked, provenance-backed integrity / disclosure **signals**, packaged for US
False Claims Act (FCA) counsel and the DOJ **FOCUS** data-miner program.

> **Signals, not verdicts.** Output is ranked *probable cause* with a confidence and a
> reason — never "proof of fraud." The decisive document (e.g. an NIH "Other Support"
> page) is usually non-public. **Not legal advice.**

## What's here (M0)

- **`@workspace/db` → `src/schema/integrity/`** — canonical `ri_*` tables
  (researchers, institutions, funders, grants, works + links), plus legal-by-design
  hooks: `ri_provenance` (+ `public_as_of`), `ri_original_source_log`,
  `ri_cases.disclosure_state`, `match_confidence`, and a labelled `ri_ground_truth_cases`.
- **`@workspace/integration-nih-reporter`** — NIH RePORTER v2 client (zod-validated).
- **`@workspace/integration-openalex`** — OpenAlex works/author client (entity-resolution backbone).
- **`@workspace/extrapolator`** — resolver + linkage + provenance helpers, the seeded
  known-positive ground-truth set, and a runnable org → grants → works slice.

## Run the slice

```bash
pnpm install
# dry-run (no DB):
pnpm --filter @workspace/extrapolator run slice -- \
  --org "Dana-Farber Cancer Institute" --ror https://ror.org/02jzgtq86

# provision DB schema, then seed ground truth + persist:
pnpm --filter @workspace/db run push
DATABASE_URL=... pnpm --filter @workspace/extrapolator run seed-ground-truth
DATABASE_URL=... pnpm --filter @workspace/extrapolator run slice -- --org "..." --ror "..." --persist
```

Set `OPENALEX_MAILTO` for OpenAlex's polite pool.

## Roadmap

- **M1 — Pipeline B (foreign-funding mismatch):** CORDIS/UKRI connectors + funding-
  acknowledgment parsing + the mismatch detector + scoring; validate precision/recall
  against `ri_ground_truth_cases` (the FOCUS metric).
- **M2 — certification chain** (ExPORTER link tables).
- **M3 — Pipeline A images** (open-source within-corpus duplication; ImageTwin optional).

See `MASTER-SPEC.md` for the full design, open decisions, and the do-not-reintroduce list.
