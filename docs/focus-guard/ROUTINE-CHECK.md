# Focus Guard — Routine Check

This is the living development log for **Focus Guard**. Each "routine" reads
this file, advances the feature one well-tested increment, updates the status
and changelog below, and leaves a clear plan for the next routine. Keep it
honest: green means verified, not hoped.

- **What:** an epistemic-integrity guardrail for scientific discourse — keeps
  reviews/comments on a paper's central claim and nudges (never blocks) on
  cognitive bias / rhetorical drift / hostility.
- **Why a schema with a view to full development:** the engine, the persistence
  layer, and the server adapter are all expressed in one small, stable type
  vocabulary (`lib/focus-guard/src/types.ts`) so the feature can grow —
  API → UI → model-assist → calibration — without churning the core.
- **Read first:** [`README.md`](./README.md) and [`PSYCHOLOGY.md`](./PSYCHOLOGY.md).

---

## Status dashboard

| Layer                                        | State                   | Where                                                |
| -------------------------------------------- | ----------------------- | ---------------------------------------------------- |
| Core type vocabulary                         | ✅ done                 | `lib/focus-guard/src/types.ts` (+ zod schemas)       |
| Psychology-grounded bias registry            | ✅ done                 | `lib/focus-guard/src/biases.ts` (12 patterns, cited) |
| Deterministic lexicon                        | ✅ done                 | `lib/focus-guard/src/lexicon.ts`                     |
| Anchor derivation                            | ✅ done (heuristic-v1)  | `lib/focus-guard/src/anchor.ts`                      |
| Topical drift scoring                        | ✅ done                 | `lib/focus-guard/src/drift.ts`                       |
| Signal detection + engagement                | ✅ done                 | `lib/focus-guard/src/detect.ts`                      |
| Autonomy-supportive nudges                   | ✅ done                 | `lib/focus-guard/src/nudge.ts`                       |
| Orchestrator (`evaluate`)                    | ✅ done                 | `lib/focus-guard/src/guard.ts`                       |
| Thread-health aggregation                    | ✅ done                 | `lib/focus-guard/src/health.ts`                      |
| Unit tests (node:test)                       | ✅ 15 passing           | `lib/focus-guard/src/focus-guard.test.ts`            |
| DB schema (`focus_anchors`, `focus_signals`) | ✅ done                 | `lib/db/src/schema/focusGuard.ts`                    |
| Server adapter (DB ↔ engine)                 | ✅ done, ⛔ not mounted | `artifacts/api-server/src/lib/focusGuard.ts`         |
| HTTP routes / OpenAPI                        | ❌ todo                 | —                                                    |
| UI surface (nudge + health badge)            | ❌ todo                 | —                                                    |
| LLM-assisted augmenter                       | ❌ todo (hooks exist)   | `EvidenceOverrides`                                  |
| Calibration corpus + metrics                 | ❌ todo                 | —                                                    |

**Engine version tag:** `heuristic-v1` (stored in `generatedBy`; bump when
detection/scoring changes so stale rows can be re-evaluated).

## How to verify (run every routine)

```bash
pnpm install --prefer-offline
pnpm run typecheck                              # whole workspace, must be clean
pnpm --filter @workspace/focus-guard run test   # 15 cases, must pass
```

## Architecture at a glance

```
PaperLike ──deriveAnchor──▶ FocusAnchor
                               │
Contribution ──────evaluate(·, anchor)──────▶ FocusReport
  (review/comment text+stance)   │              { driftScore, verdict,
                                  │                signals[], engagementScore,
                                  │                interventionLevel, nudge }
                                  ▼
                       detect (biases) + measureDrift (topic) + scoreEngagement
                                  │
          many FocusReport ──aggregateHealth──▶ FocusHealth (per paper/thread)
```

Server side (`artifacts/api-server/src/lib/focusGuard.ts`):
`ensureAnchor` / `refreshAnchor`, `guardReview`, `guardComment`,
`guardContribution`, `getThreadHealth` — all idempotent (upsert on unique keys).

## Invariants — do NOT regress these

1. **Focus Guard never blocks.** `InterventionLevel` stops at `reframe`. No
   route may reject a contribution because of a Focus Guard verdict.
2. **Nudges are autonomy-supportive.** Offering language only. The test
   `evaluate: hostile / ad hominem…` asserts this — keep it.
3. **Topic ≠ tone ≠ reasoning.** Only `rhetorical_drift`-family signals inflate
   `driftScore`. A hostile, on-topic review must keep low drift.
4. **High precision over recall.** Don't widen markers without a corpus showing
   the false-positive rate stays low (alarm fatigue). Add tests with the
   widened markers.
5. **Deterministic core.** No network/model calls inside `lib/focus-guard`.
   Model assistance enters only through `EvidenceOverrides`.
6. **One registry.** New patterns are a single entry in `biases.ts` (with
   `psychBasis` + `citations`) plus a test — not scattered conditionals.

## Known limitations / calibration notes (honest list)

- Detection is **English-only** and **lexical**; it will miss paraphrase and
  sarcasm, and can over-fire on quoted bad behaviour (someone _describing_ an ad
  hominem). The LLM augmenter (next-routine candidate) is the intended fix.
- `deriveAnchor` central-claim picking is a heuristic (claim-cue sentence →
  first abstract sentence → title). Good enough for scoring; not display-grade.
- Drift scaling constants (`0.75`/`0.45` blend, `1.8`/`0.6` coverage scale) and
  `DRIFT_THRESHOLDS` are reasoned, not yet **calibrated** against labelled data.
- Engagement scoring rewards citation/quant markers; a well-argued purely
  qualitative point can score lower than ideal.

## Next-routine plan (priority order)

1. **Mount HTTP endpoints + OpenAPI** (highest leverage; makes it real)
   - `POST /papers/:id/focus/anchor` (ensure/refresh) → anchor.
   - `GET  /papers/:id/focus/health` → `FocusHealth`.
   - On review/comment create: call `guardReview`/`guardComment`, attach the
     `FocusReport` to the response so the client can show the nudge inline.
   - Add `FocusReport`/`FocusHealth`/`FocusAnchor` schemas to
     `lib/api-spec/openapi.yaml`, then `pnpm --filter @workspace/api-spec run
codegen`. Mirror the existing `RigorReport`/`AiSurvey` shapes.
   - Decide: persist on write (cheap, current adapter) vs. evaluate-on-read.
2. **Client surface** in `artifacts/scivet`
   - Inline nudge card on the review/comment composer (show _before_ submit as a
     soft check; never disable submit — see invariant #1).
   - A "discussion focus health" badge on the paper detail page driven by
     `GET …/focus/health` (band colour: healthy/watch/fragmented).
3. **LLM-assisted augmenter** behind `EvidenceOverrides`
   - New module `lib/focus-guard/src/augment.ts` exporting an async function that
     takes (contribution, anchor) and returns `EvidenceOverrides`, implemented
     against `@workspace/integrations-openai-ai-server`. Keep the engine sync;
     the adapter awaits the augmenter then passes overrides into `evaluate`.
   - Use it primarily to _suppress_ lexical false positives (quoting, sarcasm)
     and to add paraphrase-level scope-creep/straw-man detection.
4. **Calibration harness**
   - A small labelled corpus (`lib/focus-guard/src/__fixtures__/corpus.json`):
     contributions tagged with expected dominant signal + on/off focus.
   - A test that reports precision/recall per signal and asserts thresholds.
   - Use it to tune the drift constants and `DRIFT_THRESHOLDS`.
5. **Author-facing focus tools**
   - Let authors edit/confirm their `FocusAnchor` (human-in-the-loop beats the
     heuristic for display), and show contributors the claim while composing.
6. **Stretch:** integrate `FocusHealth` as a soft input to promotion
   (`artifacts/api-server/src/lib/promotion.ts`) — e.g. a fragmented thread
   slightly damps the community-score weight. Design carefully; must not become
   a backdoor block. Discuss before building.

## Changelog

### Routine 1 — 2026-06-23 — _Foundation_

- Created `@workspace/focus-guard`: full deterministic engine (anchor → evaluate
  → health), 12-pattern psychology-grounded bias registry with citations, and
  autonomy-supportive nudges. 15 unit tests, all green.
- Added DB schema `focus_anchors` + `focus_signals` (+ schema index export).
- Added server adapter `focusGuard.ts` (DB ↔ engine, idempotent upserts);
  wired `@workspace/focus-guard` into the api-server package + tsconfig.
- Wrote `README.md` and `PSYCHOLOGY.md` (research grounding + full references).
- Whole-workspace `typecheck` clean.
- **Not done / handed off:** HTTP routes, OpenAPI, UI, LLM augmenter,
  calibration. See plan above — start at item 1.
