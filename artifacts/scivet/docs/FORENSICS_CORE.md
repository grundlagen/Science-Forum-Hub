# Integrity Mode — forensics core + ingestion (Phases A, B, C, D, E)

Vertical slice of the one-shot in `DUPLICATION_DETECTION_ONESHOT.md`.
Deterministic and typecheck-green. It surfaces **candidates for human review** —
never a determination of misconduct (see the one-shot §0). Real image bytes now
flow end-to-end: decode → perceptual hash → `scoreMatch`.

## What's implemented

**Schema (Phase A)** — `lib/db/src/schema/`
- `figures` — a figure/panel with provenance (`sourceType`, `sourceRef`),
  `storageKey`, perceptual `phash`, optional `embedding`. `paperId` is nullable
  (external-corpus figures aren't tied to a SciVet paper); `parentFigureId` links
  split panels to their parent.
- `figure_matches` — a flagged pair: `matchClass` (near_dup | copy_move |
  transformed | splice), `similarity`, recovered `transform`, `regions`, and a
  `status` only a **human** may move off `unreviewed`.

**Detector core (Phase D, pure TS)** — `artifacts/api-server/src/lib/forensics/`
- `image.ts` — `GrayImage` ops: box resize, variance, rotate 90/180/270, flip H/V.
- `phash.ts` — DCT-based 64-bit perceptual hash + Hamming similarity.
- `blot.ts` — blot/gel likeness (caption keywords + low texture) that drives the
  stricter gate for high-false-positive images.
- `detect.ts` — `nearDuplicate` (tests rotation/flip variants → catches
  transformed reuse), `copyMove` (block-offset voting), `spliceSeams` (column
  discontinuity), and `scoreMatch` (blot-gated combiner, observation-only text).
- `rank.ts` — `suspicionScore` for the triage queue: diminishing returns,
  blot-FP discount, cluster boost.
- `types.ts` — `GrayImage`, `MatchResult`, and the standing `INTEGRITY_DISCLAIMER`.

**Ingestion + decode (Phases B/C)** — `artifacts/api-server/src/lib/ingest/`
- `decode.ts` — PNG/JPEG bytes → `GrayImage` (magic-byte sniff, Rec.601 luma),
  plus `encodeGrayPng` for storage/thumbnails/round-trip tests. Uses pure-JS
  `pngjs` + `jpeg-js` (no native build).
- `types.ts` — `RawFigure`, the `FigureSource` interface, and an **injectable
  `Fetcher`** so adapters are unit-testable offline and the caller owns
  rate-limiting / proxy / ToS.
- `pmcOa.ts` — PMC Open Access source: `parseJatsFigures` (label/caption/graphic
  from JATS XML), `pmcEfetchUrl`, `resolveGraphicUrl`, and `pmcOaSource` that
  fetches JATS + graphics via the injected fetcher. OA subset only.
- `upload.ts` — wrap user-supplied bytes as a `RawFigure`.
- `storage.ts` — content-addressed local store (`sha256.<ext>`, dedup, env dir),
  a seam for S3.
- `panels.ts` — projection-profile multi-panel splitter (+ `crop`).
- `pipeline.ts` — `prepareFigure` / `prepareFigureWithPanels`: decode → store →
  `pHash` → the `InsertFigure` row (DB write stays in the route layer).

**Fixture gates (§4 rung 1)**
```
pnpm --filter @workspace/api-server run test:forensics   # 11 checks — detectors + ranking
pnpm --filter @workspace/api-server run test:ingest      # 24 checks — decode/JATS/storage/panels/e2e
```
The ingest gate includes an **end-to-end** proof (encoded bytes → decode →
`scoreMatch` flags rotated reuse; distinct figures cleared). All green, offline.

## Deferred (next phases, see the one-shot)

- **Live corpus run**: wire `pmcOaSource` to the real `httpFetcher` behind rate
  limiting, then run the §4 labelled-corpus rung against known-retracted papers to
  calibrate thresholds. (Parsing/orchestration done; only the live fetch + a small
  runner remain.)
- **TIFF decode** (common in PMC OA) and **bioRxiv PDF raster** extraction.
- Keypoint matching (SIFT/ORB + RANSAC) for **sub-region** transformed reuse under
  arbitrary affine warps — current `nearDuplicate` handles whole-figure rotate/flip.
- API routes (`/integrity/*`) and the triage UI console (Phase F/G).
- ANN prefilter / pgvector so cross-corpus matching is O(candidates), not O(n²).

The detector + ingest functions are the stable substrate the deferred phases plug into.
