# Execution map & source-adaptation guide

*Written to be handed to another engineer or LLM. It shows exactly what runs for each
entry point, which external source each step touches, and the precise file + constant
to change a source. Not legal advice. Every output is probable cause for review, not a
finding — see the invariants at the end; do not break them.*

## Mental model

Two independent pipelines share one repo:

1. **Relator engine (TypeScript)** — `lib/extrapolator` + `lib/integrations/*`. Pulls
   public funding/award data, runs detectors, emits ranked signals + case packages.
   Run with `pnpm --filter @workspace/extrapolator run <script>`.
2. **Image forensics (Python)** — `services/image-forensics/*.py`. Harvests figures,
   segments panels, embeds + indexes them, confirms duplication hits. Run with
   `python <file>.py`. No connection to the TS side; it is a standalone service.

Nothing runs a hidden daemon. Every entry point is a single process you invoke.

## Repo layout (the parts that execute)

```
lib/
  integrations/            # one package per external source (the SOURCE layer)
    nih-reporter/src/client.ts      BASE = https://api.reporter.nih.gov/v2
    openalex/src/client.ts          BASE = https://api.openalex.org   (OPENALEX_MAILTO)
    usaspending/src/client.ts       BASE = https://api.usaspending.gov/api/v2
    cms/src/client.ts               data.cms.gov datasets
    ocds/src/...                    OCDS procurement (50+ countries), pure parser
    sam-exclusions/src/index.ts     PURE: parses the SAM.gov exclusions CSV (no URL)
    oig-leie/src/index.ts           PURE: parses the OIG LEIE CSV (no URL)
    sba-ppp/src/index.ts            PURE: parses the SBA PPP FOIA CSV (no URL)
  extrapolator/src/        # the ENGINE
    dossier.ts             orchestrates nih-reporter + openalex into one subject dossier
    extract.ts             connector payloads -> typed detector inputs
    resolvePi.ts           author/PI resolution + identity confidence
    detectors/*.ts         pure detector logic (one file per signal)
    stats/fabrication.ts   GRIM / Benford / terminal-digit
    corroborate.ts         cross-source reasoning (caps single-source hits)
    generalCase.ts         signal -> program + reward + triage -> Markdown package
    programs.ts triage.ts  reward mapping + ethics triage
    <entry>.ts             the runnable CLIs (see table below)
services/image-forensics/  # the IMAGE service (Python)
```

Package scripts live in `lib/extrapolator/package.json` (`scripts` block).

## Part A — Relator engine: entry point → files → source

Each row is one `pnpm --filter @workspace/extrapolator run <cmd>`.

| cmd | entry file | executes (in order) | external source | change source at |
|---|---|---|---|---|
| `detect-foreign-funding` | `detectForeignFunding.ts` | `dossier.ts` → `resolvePi.ts` → `extract.ts` → `detectors/foreignFunding.ts` | NIH RePORTER + OpenAlex | `nih-reporter/src/client.ts` `BASE`; `openalex/src/client.ts` `BASE` |
| `validate-foreign-funding` | `validateForeignFunding.ts` | same, over a `LABELED` list (edit that array in-file) | NIH RePORTER + OpenAlex | same |
| `scan-recipient` | `scanRecipient.ts` | `usaspending.searchAwardsByRecipient` → `sam-exclusions` parse → `detectors/debarredRecipient.ts` → `generalCase.ts` | USASpending API + SAM CSV (`--exclusions <path>`) | `usaspending/src/client.ts` `BASE`; CSV path is a CLI arg |
| `scan-provider` | `scanProvider.ts` | `cms` → `oig-leie` parse → `detectors/excludedProvider.ts` | CMS API + OIG LEIE CSV | `cms/src/client.ts`; CSV path arg |
| `scan-subawards` | `scanSubawards.ts` | `usaspending.searchSubawardsByRecipient` → `detectors/debarredSub.ts` | USASpending API + SAM CSV | `usaspending/src/client.ts` `BASE` |
| `scan-known-cases` | `scanKnownCases.ts` | detectors only, **offline** (baked public figures) | none | — |

PPP has no CLI yet; call it directly: `parsePppCsv`/`buildPppIndex` from
`@workspace/integration-sba-ppp` → `detectPppAnomalies` from `@workspace/extrapolator`
(snippet in `TERMINAL-CLAUDE-RUNBOOK.md` §2.2).

**How a request flows (detect-foreign-funding example):**
1. CLI parses the PI name/flags.
2. `dossier.ts` calls `nih-reporter` (grants) + `openalex` (works/authors/funders) and
   `resolvePi.ts` resolves which OpenAlex author is the PI, returning
   `matchConfidence`, `matchMethod`, `matchedPmidCount`.
3. `extract.ts` turns works into `ForeignEvidence` items.
4. `detectors/foreignFunding.ts` scores by corroboration **and** gates on identity
   (weak/common-name matches are capped — see invariants).

## Part B — Image forensics: file → role → source

| file | role | external source | change source at |
|---|---|---|---|
| `harvest_figures.py` | download figures for a query | **Europe PMC REST** | `EUROPEPMC` const (line ~29); the query arg; the `limit` arg |
| `panel_segment.py` | split a figure into panels | none | tunables at top |
| `embedding_index.py` | build/query the cross-corpus index | DINOv2 via `torch.hub` on first `build` (else fully offline `classic` backend) | `_try_deep_embedder()`; `MATCH_THRESHOLD` |
| `detector.py` | pHash + ORB/RANSAC confirm | none | tunables at top |
| `advanced_detector.py` | detector.py + flip-invariant pass | none | `FLIP_MIN_INLIERS` |
| `forensics.py` | intra-image copy-move + ELA | none | tunables at top |
| `live_run.py` / `index_test.py` / `stress_test.py` | benchmarks | GitHub raw (live_run) | — |

**Image flow:** `harvest_figures.py` → `./corpus/<pmcid>/*.png` → `embedding_index.py
build` (calls `panel_segment.py` per figure, embeds each panel) → `embedding_index.py
query <panel>` returns top-k leads → confirm each lead with `advanced_detector.py`.

## How to change / add a source

### Swap a base URL (mirror, proxy, cached copy)
Edit the `BASE` const in the relevant `lib/integrations/<name>/src/client.ts`, or
`EUROPEPMC` in `harvest_figures.py`. Nothing else references the URL.

### Add a whole new source (TS connector)
1. `mkdir lib/integrations/<name>/src`; add `package.json` (copy `sba-ppp/package.json`,
   rename), `tsconfig.json` (copy any sibling), and `src/index.ts` (or `client.ts`).
2. Export **normalized records** + a parser/fetcher. Keep it pure if the source is a
   bulk file (like `sam-exclusions`, `oig-leie`, `sba-ppp`); add a `client.ts` with a
   `BASE` const + zod schema if it's an API (like `nih-reporter`).
3. Register it: add the path to root `tsconfig.json` `references` **and**
   `lib/extrapolator/tsconfig.json` `references`, and to `lib/extrapolator/package.json`
   `dependencies` as `"@workspace/integration-<name>": "workspace:*"`.
4. Consume it in a detector or a new `scan-*` CLI; add the CLI to `package.json` scripts.
5. `pnpm install && pnpm run typecheck`, then add a `verify-*` suite (copy an existing
   one) so it's regression-tested offline.

### Add a new figure source (Python)
Add a function alongside `search_pmcids`/`fetch_figures` in `harvest_figures.py` that
writes images into `./corpus/<id>/`. The rest of the pipeline is source-agnostic — it
just reads image files from a directory.

## Scaling to millions of papers (the honest gap)

The detectors are done; scale is a *data* job, not a code change:
- **Bulk, not per-article.** `harvest_figures.py` sips one article at a time (polite
  0.4s sleep) — fine for hundreds, hopeless for millions. Switch to the **PMC Open
  Access bulk package** (NCBI FTP/S3 tarballs of the whole OA subset) + parallel
  download. Filter to US funders via the OA file list / metadata.
- **Real ANN index.** `embedding_index.py` uses exact in-memory cosine (great to ~1M
  panels). Past that, back it with **FAISS** (the file is structured for this swap).
- **Storage/time.** Millions of figures = terabytes + days of pulling. This is the
  moat commercial tools (ImageTwin ~160M, Proofig ~155M) spent years building.

## Using ImageTwin / Proofig (closed tools)

No public bulk API. Realistic integration = **confirmer on our candidates**: our
cheap pipeline surfaces suspect papers, you check only those against their full corpus
(pay per check, not per million). A clean seam for this can live in a new
`services/image-forensics/external_checkers.py` (an interface that takes a figure and
returns their verdict) — add it when you have access; don't fake an API.

## Invariants any modifier (human or LLM) MUST keep

1. **Signals, not verdicts.** Never emit "fraud"; emit ranked probable cause + reason.
2. **Country/identity-neutral.** Nationality is never a score input. A weak, common-name
   author match is **capped** and labelled `IDENTITY UNCONFIRMED`
   (`detectors/foreignFunding.ts`, `isIdentityConfirmed`) — do not remove this gate.
3. **Corroborate.** Single-source hits are capped in `corroborate.ts`; ≥2 independent
   detectors are what escalate.
4. **Ethics triage.** `triage.ts` routes small/individual/public-benefit subjects to
   "notify first." Keep it in the path to any case package.
5. **Human + counsel in the loop** before contacting anyone or filing (seal,
   first-to-file, original-source: `31 U.S.C. §3730(e)(4)`).
