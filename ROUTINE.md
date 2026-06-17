# Routine Log — Focus Guard

This is the hand-off file between routine runs building the **Focus Guard**
feature. Read this first, do the next chunk, leave it better than you found it,
update this log, commit, push.

**Feature:** a reviewer attention-integrity engine for SciVet — protects the
quality of peer review by guarding independent judgment, genuine reading,
freedom from decision fatigue, clean context switches, and sustained focus.
Full design + citations: `lib/focus-guard/FOCUS_GUARD.md`.

**Working branch:** `claude/upbeat-fermat-1dvwpj`

---

## Status board

| Phase | What | State |
|-------|------|-------|
| 1 | Pure engine + DB schema + self-check | ✅ done |
| 2 | API spec + server handlers + event folding | ⬜ next |
| 3 | React hooks + UI components | ⬜ |
| 4 | Calibration, settings, A/B | ⬜ |

---

## Phase 1 — Foundation ✅ (routine 1, 2026-06-17)

Shipped a complete, verified, **pure** engine and its persistence schema.

- `lib/focus-guard/` — new `@workspace/focus-guard` package:
  - `src/constants.ts` — every psychological parameter, each cited.
  - `src/types.ts` — Zod input schemas (`assessInputSchema`, `focusSessionSchema`,
    `paperEngagementSchema`) + plain output types (`FocusAssessment`, …).
  - `src/engine/` — `blind`, `reading`, `fatigue`, `circadian`, `residue`,
    `flow`, `math`, and the `assess` orchestrator.
  - `src/selfCheck.ts` — pure invariant battery (the executable spec).
  - `test/run.ts` — runner (esbuild → node).
- `lib/db/src/schema/focusSessions.ts` — `focus_sessions` + `focus_events`
  tables, exported from the schema index.
- Wired into root `tsconfig.json` references.

**Verification (both pass):**
```bash
pnpm run typecheck:libs
pnpm --filter @workspace/focus-guard run verify   # 22 passed, 0 failed
```

**Design decisions worth keeping:**
- Engine is pure: caller passes `now`; no clock/DB/env reads. Keep it that way.
- Persistence is split: an append-only `focus_events` log folded into rolling
  `focus_sessions` counters. The log lets us re-tune constants and recompute.
- `verdictIntegrity` (0..1) is meant to be **stored on each review** so the feed
  / promotion math can weight trustworthy verdicts more heavily later.

---

## Phase 2 — API (do this next)

Goal: expose the engine over HTTP and persist sessions/events. Suggested shape
(match `lib/api-spec/openapi.yaml` conventions — operationId, tags, Zod via
Orval codegen in `lib/api-zod` / `lib/api-client-react`):

1. **OpenAPI ops** in `lib/api-spec/openapi.yaml`, new tag `focus`:
   - `POST /focus/session` → start/get the live session for the current user.
   - `POST /focus/events` → append a `FocusEvent` (paper_opened, scroll_progress,
     stance_committed, verdict_committed, paper_closed, break_started/ended).
   - `GET  /focus/assessment?paperId=` → fold events → call `assessFocus` →
     return the `FocusAssessment`.
   - Add `FocusAssessment`, `FocusSession`, `FocusEventInput` schemas.
2. **Server handlers** (there is no `lib/api-server` package yet — check
   `artifacts/` for where the Express app lives; create the package if needed):
   - A `foldSession(events): FocusSession` reducer (event log → engine input).
   - Wire `assessFocus` and return the assessment.
   - On `verdict_committed`, persist `verdictIntegrity` onto the review row
     (needs a `reviews.verdict_integrity` column — add to schema + migration).
3. Run `pnpm --filter @workspace/api-spec run codegen` after spec edits.
4. Extend `selfCheck()` with a `foldSession` round-trip case.

**Open questions to resolve in Phase 2:**
- Where is the Express server? (`artifacts/scivet` is the frontend; locate or
  create the API server package.)
- Session lifecycle: when does a sitting end? (idle timeout vs. explicit close.)
- Should `localHour`/`chronotype` come from the profile or the request?

---

## Phase 3 — UI (later)

`useFocusGuard()` hook polling `/focus/assessment`; components: reading-progress
meter, blind overlay masking `assessment.blind.hidden` signals, fatigue HUD,
flow indicator, break prompt modal. Respect `nudges` ordering and flow
suppression. Frontend lives in `artifacts/scivet`.

## Phase 4 — Calibration (later)

Instrument real sessions, fit constants to review-quality outcomes, A/B the
guards, expose per-user toggles (the engine already honours `guardsEnabled`).

---

## Conventions reminder
- pnpm workspace, TS 5.9, ESM, extensionless imports (bundler resolution),
  `zod/v4`. Lib packages are `emitDeclarationOnly` composite projects.
- Keep the engine pure. Put I/O in the API layer, not in `@workspace/focus-guard`.
- Always leave `typecheck:libs` green and `selfCheck()` at 0 failures.
