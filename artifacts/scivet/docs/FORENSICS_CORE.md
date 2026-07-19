# Integrity Mode — forensics core (Phase A + detector core)

First vertical slice of the one-shot in `DUPLICATION_DETECTION_ONESHOT.md`.
Dependency-free, deterministic, and typecheck-green. It surfaces **candidates for
human review** — never a determination of misconduct (see the one-shot §0).

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

**Fixture gate (§4 rung 1)** — `artifacts/api-server/scripts/forensics-fixture-test.ts`
```
pnpm --filter @workspace/api-server run test:forensics
```
11 checks: exact/rotated/distinct near-dup, blot gate, copy-move ±, splice ±, and
ranking sanity. All green.

## Deferred (next phases, see the one-shot)

- Keypoint matching (SIFT/ORB + RANSAC) for **sub-region** transformed reuse under
  arbitrary affine warps — the current `nearDuplicate` handles whole-figure
  rotate/flip only.
- Ingestion adapters (PMC OA, bioRxiv, upload) + image decode → `GrayImage`
  (Phase B/C).
- API routes (`/integrity/*`) and the triage UI console (Phase F/G).
- ANN prefilter / pgvector so cross-corpus matching is O(candidates), not O(n²).

The detector functions are the stable substrate the deferred phases plug into.
