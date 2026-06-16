# FocusGuard

> Deep reading is a craft. FocusGuard is the part of SciVet that protects it.

## Why this exists

SciVet's value is the *quality* of its peer review. The enemy of quality review
is not bad intent — it's fragmented attention: skimming a dense methods section,
casting a verdict from the abstract, reading with six tabs open. FocusGuard makes
sustained attention a first-class, visible, and rewarded act:

1. A reviewer **commits to an intention** and a timebox before reading.
2. The platform **guards and measures** the session (focused time, distractions
   named, breaks taken) without surveilling content.
3. A verdict that followed a qualifying deep session earns a **Deep review**
   badge — an honest provenance signal the community can trust.

## Grounding in psychology

Every field in the schema maps to an evidence-based principle. The goal is to
*nudge*, never nag (Self-Determination Theory: autonomy-supportive by default).

| Principle | Source | Where it lives |
|---|---|---|
| Implementation intentions ("when X, I will Y") raise follow-through | Gollwitzer & Sheeran | `focus_sessions.intent`, intent templates |
| Specific, challenging goals beat "do your best" | Locke & Latham (goal-setting) | `planned_minutes`, `daily_goal_minutes` |
| Timeboxing counters Parkinson's law / procrastination | Cirillo (Pomodoro) | `technique`, `planned_minutes` |
| Flow needs clear goals, feedback, challenge–skill balance | Csikszentmihalyi | `goal_type`, `flow_rating`, uninterrupted phase |
| Directed attention must be restored, not just spent | Kaplan & Kaplan (ART) | `break_minutes`, break events |
| Self-monitoring an urge reduces the behaviour | Kanfer (CBT) | `distraction` events, `distraction_count` |
| Incomplete tasks stay mentally active (resumption) | Zeigarnik | paused/active sessions surfaced to resume |
| Pre-commitment devices improve follow-through | Thaler & Sunstein; Ulysses pact | `pledge`, `distraction_blocklist` |
| Motivation rises near a goal; streaks leverage this | Hull; Kivetz (goal-gradient) | `streak_count`, daily-goal progress |
| Effort justification builds trust in a judgement | Festinger | Deep-review provenance badge |
| Peak alertness varies by chronotype | Roenneberg | `chronotype` → suggested window |

Deliberately **avoided**: variable/randomised reward loops, public leaderboards,
and loss-framed streak pressure — all of which trade long-term intrinsic
motivation for short-term engagement, and would corrupt the review-trust signal.

## Data model (`lib/db/src/schema`)

- **`focus_profiles`** — one row per user: defaults (technique, focus/break
  minutes), `daily_goal_minutes`, `chronotype`, a self-authored `pledge`, a
  `distraction_blocklist`, and slow-moving streak state.
- **`focus_sessions`** — one bounded session: `intent`, `goal_type`,
  `technique`, the timebox, live counters (`focused_seconds`,
  `distraction_count`, `breaks_taken`), post-session `focus_rating` /
  `flow_rating` / `reflection`, and `result_review_id` linking the session to the
  review it produced.
- **`focus_events`** — the session timeline: `distraction`, `pause`, `resume`,
  `break_start`, `break_end`, `note`, `milestone`.

### What makes a session "qualify"

A session backs a streak and a Deep-review badge only if it is `completed`, has a
reading/reviewing goal, and its focused time reaches `max(70% of the timebox,
10 minutes)`. See `isQualifyingSession` in
`artifacts/api-server/src/lib/focusGuard.ts` — the single source of truth, reused
by stats, streaks, and provenance.

## API (`/api/focus/*`)

Defined in `lib/api-spec/openapi.yaml`; client + validators are generated.

| Method & path | Purpose |
|---|---|
| `GET /focus/profile` · `PATCH /focus/profile` | Read / update preferences |
| `GET /focus/recommendation?goalType=` | A psychology-tailored session plan |
| `GET /focus/stats` | Streak, today's progress, totals, deep-review count |
| `GET /focus/sessions` · `POST /focus/sessions` | List / start |
| `GET /focus/sessions/{id}` | Session + event timeline + `qualifiesAsDeep` |
| `POST /focus/sessions/{id}/heartbeat` | Report focused time, pause/resume |
| `POST /focus/sessions/{id}/events` | Log a distraction, break, or note |
| `POST /focus/sessions/{id}/complete` | Finish, reflect, advance streak |
| `POST /focus/sessions/{id}/abandon` | End without penalty |
| `GET /papers/{id}/focus/active` | The user's open session on a paper |

Reviews now expose `focusBacked` and `focusMinutes`; on cast, the most recent
unlinked focus session for that paper/user is attached as provenance.

## Frontend (`artifacts/scivet`)

- `/focus` — the FocusGuard hub: stats strip, start form (intent + technique +
  timebox) seeded by the recommendation, recent sessions, and the live
  **Focus Console** (timer ring, distraction button, breaks, reflection).
- `hooks/use-focus-session.ts` — the timer engine (tick, throttled heartbeats,
  break cadence, distraction logging).
- A "read it deeply first" CTA on each paper's review panel links to
  `/focus?paperId=…&goal=review`; the **Deep review** badge appears on
  focus-backed reviews (profile page).

## Codegen note

`pnpm --filter @workspace/api-spec run codegen` runs Orval, then
`scripts/wrap-query-options.mjs`, then the typecheck. The wrap step restores the
`Partial<UseQueryOptions<…>>` shape the app relies on for `{ query: { enabled } }`
call sites (current Orval emits a non-`Partial` form that makes `queryKey`
required). This keeps regeneration reproducible and non-breaking.

## Database

These tables are additive. Apply with `pnpm --filter @workspace/db run push`
(dev) against a provisioned `DATABASE_URL`. `artifacts/api-server/scripts/seed.ts`
seeds a demo focus habit, including a deep session linked to a real review.
