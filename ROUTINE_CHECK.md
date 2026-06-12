# Routine Check — Focus Guard

Stateful log for the recurring Focus Guard routine. Each run: read this file
first, do the next tranche of work, update this file, commit and push to the
working branch. Design source of truth: `docs/FOCUS_GUARD.md` (psychology →
schema mapping; change the doc before the code).

## Current status

**Iteration:** 1 (bootstrap) — 2026-06-12
**Branch:** `claude/relaxed-faraday-6aakff`
**State:** v0 + v1 + most of v2 complete end-to-end. Typecheck green across
workspace, full build green (set `PORT` and `BASE_PATH` env vars), 11/11 unit
tests pass (`pnpm --filter @workspace/api-server test`).

## Done in iteration 1

- `docs/FOCUS_GUARD.md` — full design doc: 11 psychology findings (Gollwitzer,
  Zeigarnik/Masicampo-Baumeister, Leroy, Mark, Ariely, Csikszentmihalyi,
  Deci & Ryan, Kaplan/BRAC, Hull/Kivetz, Dai-Milkman-Riis, Skinner) each mapped
  to a concrete schema/API decision, plus the anti-dark-pattern constitution
  (no daily streaks, no shame copy, no hard locks) and a v0→v3 roadmap.
- DB schema (`lib/db/src/schema/`): `focusSessions.ts` (partial unique index =
  one active session per user), `focusCaptures.ts`, `focusSettings.ts`.
- OpenAPI: `focus` tag, 10 endpoints, 14 component schemas; codegen run.
- API server: `src/lib/focusGuard.ts` (pure logic: clamping, outcome
  derivation, ulysses friction, break suggestion, Monday week-start, weekly
  cadence, closure copy) + `focusGuard.test.ts` (10 tests, node:test via tsx;
  added `test` script) + `src/routes/focus.ts` (all endpoints, lazy expiry
  sweep, ownership checks) registered in routes index.
- scivet: `/focus` page (start form with implementation-intention scaffold,
  duration slider, gentle/ulysses lock; live timer with parking-lot capture
  pad; closure ceremony dialog; summary with capture triage incl. "let go";
  weekly stats card, recent sessions). Quiet shell in `layout.tsx`: Focus nav
  link, pulsing "Focusing" pill, feed link dimmed/disabled during sessions.
- Tooling fix: regenerating the orval client lost the hand-applied
  `Partial<UseQueryOptions>` patch the repo depends on; added
  `lib/api-spec/scripts/patch-partial-query-options.mjs` and chained it into
  the `codegen` script so regeneration is reproducible now.
- **v1 tranche (same day):** "Focus on this paper" button on `paper-detail`
  → `/focus?paper={id}` with linked-paper chip (unlinkable) on the start form;
  settings dialog (default length, weekly target, default lock mode, quiet
  feed toggle); feed interstitial — while a session is active and quietFeed is
  on, `/feed` shows your own intention back with "Back to my session"; gentle
  mode gets a one-click bypass, ulysses mode routes to proper closure instead.
- **v2 tranche (same day):** `adaptiveDefaultMinutes` in `focusGuard.ts`
  (last 6 felt-ratings; ≥2 overwhelmed → −10 min, ≥2 too_easy → +10, ties are
  noise; clamped 10–90) exposed as `FocusStats.suggestedMinutes`, used as the
  start-form slider default with an explanatory hint; Monday fresh-start copy
  on the page header.

## Caveats / known gaps

- **DB push not run** — no `DATABASE_URL` in this environment. Before first
  use: `pnpm --filter @workspace/db run push` to create the three tables.
- `weeksActive` scans 26 weeks of sessions in app code; fine at current scale,
  revisit with SQL aggregation if it ever matters.
- Expired sessions are credited their planned minutes (documented choice in
  `focus.ts` sweep comment — stats are private; we don't police).
- No integration tests for routes (no test DB harness in repo yet).

## Next-run queue (in order)

1. **Verify in a running app** — start the dev server with a real
   `DATABASE_URL`, run `pnpm --filter @workspace/db run push`, and walk the
   whole loop (start → capture → end → triage → stats) end to end; fix
   whatever reality disagrees with.
2. **Integration tests for routes** — pglite or testcontainers harness so
   `focus.ts` (expiry sweep, 409 on double-start, ulysses friction, stats
   math) is covered beyond pure logic.
3. **v3: structured ready-to-resume** — show the previous session's
   `closingNote` on the start form when relinking the same paper ("last time
   you left off at…"); reading-position bookmarks.
4. **v3: gentle session-end chime/haptic** (client-only, off by default).
5. **Polish:** capture triage from session history (currently only in the
   post-session summary); `/focus` deep-link from the "Focusing" pill could
   carry scroll state; consider surfacing `closingNote` in history rows.

## Invariants to preserve (do not "improve" these away)

- No daily streaks, no XP, no leaderboards, no public focus stats.
- Closure copy stays factual and non-shaming (test enforces banned words).
- No hard lock mode; ulysses = one honest line, then freedom.
- Session bounds stay 10–90 min; breaks suggested away from the feed.
