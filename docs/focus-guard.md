# Focus Guard

A psychology-grounded deep-work companion for SciVet. Reading and reviewing
science is *directed-attention* work; an infinite feed is the opposite. Focus
Guard lets a researcher pre-commit to a bounded, intentional reading/reviewing
sprint, guards that attention while it runs, and reflects the data back as
streaks, stats, and a single supportive nudge.

The feature is deliberately built on real attention/motivation psychology so the
data has signal (not vanity counters) and the UX teaches as it nudges.

## Psychology model (and where it lives in code)

| Principle | What it shapes | Source of truth |
|---|---|---|
| **Implementation intentions** (Gollwitzer, 1999) — concrete *if-then* plans roughly double follow-through | Every session requires an `intention` string, seeded from editable templates | `focus-config.ts → INTENTION_TEMPLATES`; `start-panel.tsx` |
| **Pomodoro / Ultradian rhythms** (Cirillo; Kleitman's BRAC) | `technique` + focus/break lengths drive timeboxing and break scheduling | `focus-config.ts → TECHNIQUES`; `use-focus-session.ts` |
| **Flow** (Csikszentmihalyi, 1990) — clear goal, immediate feedback, single-task | `focusRating` (1–5) captures self-reported flow; the ring gives live feedback | `focus-ring.tsx`; complete dialog in `active-panel.tsx` |
| **Goal-setting theory** (Locke & Latham, 2002) — specific + measurable beats "try hard" | `goalType` / `goalTarget` / `goalProgress` and the daily-minutes goal | schema + `stats-panel.tsx` |
| **Zeigarnik effect** (1927) / cognitive offloading | The distraction **parking lot** — capture an intrusive thought and let it go | `parking-lot.tsx`; `distractions` jsonb |
| **Attention Restoration Theory** (Kaplan, 1995) — rest restores directed attention | Break phases + break reminders guard rail | `use-focus-session.ts` |
| **Self-Determination Theory** (Deci & Ryan, 2000) — autonomy, competence, relatedness | Streaks reinforce competence; **every guard rail is opt-in** (no shame, no streak-loss threats) | `deriveInsight()` in `lib/focus.ts`; `preferences-dialog.tsx` |
| **Fresh-start effect** (Dai et al., 2014) | Streaks tolerate one rest day before breaking | `computeStreaks()` in `lib/focus.ts` |

The single surfaced insight (`FocusStats.insight` + `insightCitation`) is derived
server-side from the user's own data by `deriveInsight()` — first matching rule
wins, ordered so the most actionable signal surfaces. Framing is always
autonomy-supportive.

## Data model — `lib/db/src/schema/focus.ts`

- **`focus_preferences`** (one row per user): `technique`, focus/break/long-break
  minutes, `cyclesBeforeLongBreak`, `dailyGoalMinutes`, `guardRails` (jsonb),
  `soundscape`, `ritualNudge`.
- **`focus_sessions`**: pre-commitment fields (`intention`, `technique`,
  `intent`, `plannedMinutes`, `goalType`, `goalTarget`, optional `paperId` /
  `field`), lifecycle (`status`, `startedAt`, `endedAt`), live progress
  (`focusSeconds`, `goalProgress`, `breaksTaken`), the `distractions` jsonb
  parking lot (+ denormalized `distractionCount`), and self-report
  (`energyBefore`, `focusRating`, `moodAfter`, `reflection`).

Guard rails default to supportive values (`DEFAULT_GUARD_RAILS`). A session is
**unique-active per user** (enforced in the route, not a DB constraint), and
orphaned active sessions are reaped to `expired` after `plannedMinutes + 120m`.

## API — `lib/api-spec/openapi.yaml` (tag `focus`)

All endpoints require auth and are scoped to the current user.

| Method | Path | Purpose |
|---|---|---|
| GET | `/focus/preferences` | get-or-create preferences |
| PUT | `/focus/preferences` | partial update |
| GET | `/focus/sessions` | list (`?status=&limit=`) |
| POST | `/focus/sessions` | start (409 if one active) |
| GET | `/focus/sessions/active` | `{ session \| null }` |
| GET | `/focus/sessions/{id}` | one session |
| PATCH | `/focus/sessions/{id}` | heartbeat (`addSeconds`, `goalProgress`, `breaksTaken`) |
| POST | `/focus/sessions/{id}/distractions` | park a distraction |
| POST | `/focus/sessions/{id}/complete` | complete + reflection/flow |
| POST | `/focus/sessions/{id}/abandon` | end early |
| GET | `/focus/stats` | streaks, totals, derived insight |

Route logic: `artifacts/api-server/src/routes/focus.ts`; helpers (preferences,
stats, streaks, insight, reaping): `artifacts/api-server/src/lib/focus.ts`.

## Frontend — `artifacts/scivet/src/`

- `pages/focus.tsx` — orchestrates queries; routed at `/focus`, linked in nav.
- `components/focus/start-panel.tsx` — the pre-commitment ritual form + principle cards.
- `components/focus/active-panel.tsx` — live session: ring, pause/break/complete/abandon, goal counter, guard-rail chips, parking lot, completion dialog.
- `components/focus/stats-panel.tsx` — daily-goal ring, streaks, completion, insight.
- `components/focus/preferences-dialog.tsx` — technique, durations, daily goal, soundscape, guard-rail switches.
- `components/focus/focus-ring.tsx`, `parking-lot.tsx` — presentational.
- `hooks/use-focus-session.ts` — the timer engine: ticks, technique-aware phase
  transitions (countdown vs. flowmodoro count-up), break scheduling, and
  race-safe heartbeat syncing (server-side `focusSeconds` increment).
- `lib/focus-config.ts` — techniques, intents, templates, principles, formatters.

## Codegen note (important)

`api-client-react`'s generated query hooks must be wrapped in
`Partial<UseQueryOptions<…>>` to compile against the pinned `@tanstack/react-query`
(otherwise `queryKey` is required and `{ enabled }` call sites break). This was
previously a manual post-edit; it is now an automated, idempotent step:
`lib/api-spec/scripts/patch-react-query.mjs`, wired into the `codegen` script.
After any spec change run `pnpm --filter @workspace/api-spec run codegen`.
