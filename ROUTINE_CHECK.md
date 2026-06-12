# Routine Check — Focus Guard

Stateful log for the recurring Focus Guard routine. Each run: read this file
first, do the next tranche of work, update this file, commit and push to the
working branch. Design source of truth: `docs/FOCUS_GUARD.md` (psychology →
schema mapping; change the doc before the code).

## Current status

**Iteration:** 1 (bootstrap) — 2026-06-12
**Branch:** `claude/relaxed-faraday-6aakff`
**State:** v0 complete end-to-end. Typecheck green across workspace, scivet
builds, 10/10 unit tests pass (`pnpm --filter @workspace/api-server test`).

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

## Caveats / known gaps

- **DB push not run** — no `DATABASE_URL` in this environment. Before first
  use: `pnpm --filter @workspace/db run push` to create the three tables.
- `weeksActive` scans 26 weeks of sessions in app code; fine at current scale,
  revisit with SQL aggregation if it ever matters.
- Expired sessions are credited their planned minutes (documented choice in
  `focus.ts` sweep comment — stats are private; we don't police).
- No integration tests for routes (no test DB harness in repo yet).

## Next-run queue (in order)

1. **v1: per-paper entry point** — "Focus on this paper" button on
   `paper-detail.tsx` → `/focus?paper={id}`; start form reads the query param
   and pre-links `paperId` (API already supports it; UI doesn't send it yet).
2. **v1: settings UI** — `/focus` has no way to edit `focus_settings`
   (weekly target, default duration/lock, quietFeed). Small settings dialog;
   `useUpdateFocusSettings` hook already generated.
3. **v1: quiet shell deepening** — route-level guard on `/feed` during a
   session (gentle "you said you would…" interstitial), not just a dimmed link.
4. **v2: adaptive durations** — use `felt` history to nudge the default slider
   value (overwhelmed → shorter, too_easy → longer). Logic belongs in
   `focusGuard.ts` with tests.
5. **v2: fresh-start copy** — Monday variant of the start-view header.
6. Consider an integration-test harness (testcontainers or pglite) for routes.

## Invariants to preserve (do not "improve" these away)

- No daily streaks, no XP, no leaderboards, no public focus stats.
- Closure copy stays factual and non-shaming (test enforces banned words).
- No hard lock mode; ulysses = one honest line, then freedom.
- Session bounds stay 10–90 min; breaks suggested away from the feed.
