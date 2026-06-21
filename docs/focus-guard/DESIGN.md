# Focus Guard — Design

> _"Rigor is a craft. Disagreement is a feature."_ — SciVet footer
>
> Focus Guard adds a third clause: **A quiet mind is a prerequisite.**

## 1. Why this feature exists

SciVet's whole value proposition is the **quality of its peer review**. Papers
move through `draft → under_review → promoted → published` on the strength of
community verdicts (`endorse` / `challenge` / `reject`) plus AI rigor scores.

But a review is only as good as the mind that produced it. A reviewer who is
distracted, rushed, anchored to the first opinion they saw, or cognitively
depleted produces **shallow, biased, or harsh** verdicts. None of the existing
schema models the *attentional state* of the reviewer at the moment of judgment.

**Focus Guard makes the cognitive conditions of good reviewing a first-class
part of the product.** It is two things at once:

1. **A deep-work session engine** — start a timed, single-intention focus block
   tied to one paper, with interruption logging and an open-loop "parking lot".
2. **A reviewer cognitive guard** — a non-blocking check run the instant before
   a verdict is cast, surfacing the biases most corrosive to peer review.

It is deliberately **anti-engagement**: no infinite scroll, no variable-ratio
rewards, no manipulative streaks. It tries to make you *do less, better, then
stop*.

## 2. Psychology foundations

Every behaviour maps to a named finding. Constants live in
`artifacts/api-server/src/lib/focus.ts` (`FOCUS_CONSTANTS`).

| # | Principle | Source (informal) | Where it shows up |
|---|-----------|-------------------|-------------------|
| 1 | **Flow** — clear goals + uninterrupted blocks + challenge/skill balance | Csikszentmihalyi | One intention per session; flow self-rating 1–5 |
| 2 | **Implementation intentions** — concrete "I will do X" pre-commitments massively raise follow-through | Gollwitzer (1999) | `intent` is *required* to start a session |
| 3 | **Ultradian rhythm / Pomodoro** — focus runs in ~25–90 min cycles | Kleitman; Cirillo | `MIN/MAX_SESSION_MINUTES`, recommended length |
| 4 | **Attention residue** — task switching degrades the next task | Leroy (2009) | Mono-tasking (one active session); interruption penalty in focus score |
| 5 | **Decision fatigue / ego depletion** — judgment quality falls with cumulative load | Baumeister; Danziger et al. | `DAILY_DEEP_WORK_CEILING`; depletion guard before verdicts |
| 6 | **Zeigarnik effect** — unfinished tasks occupy working memory | Zeigarnik (1927) | "Park a thought" → `parked_thought` events |
| 7 | **Anchoring / order bias** — the first opinion you see anchors your own | Tversky & Kahneman | **Blind first pass** guard |
| 8 | **Confirmation bias** — we seek confirming evidence | Wason; Nickerson | **Steelman** prompt before reject/challenge |
| 9 | **Self-Determination Theory** — durable motivation is intrinsic (autonomy, competence, relatedness) | Deci & Ryan | Kind streaks, gentle mode, every guard is opt-out and never blocks |
| 10 | **Attention Restoration Theory** — directed attention needs genuine breaks | Kaplan | Break recommendations; `takeBreakFirst` |
| 11 | **Variable-ratio reward avoidance** | Skinner (as an anti-pattern) | We deliberately add **no** slot-machine loops |

### The "kind streak" (important design stance)

Punitive streaks weaponise loss aversion and erode intrinsic motivation. Focus
Guard's streak (`applyStreak`) gives a **grace token**: a single missed day is
covered by a token before the streak resets, and tokens replenish ~weekly
(capped). The streak is a *record of practice*, not a leash. `gentleMode`
removes streak pressure entirely.

## 3. Data model

`lib/db/src/schema/focusGuard.ts` (Drizzle + Postgres). Created via
`drizzle-kit push` (this repo does not use migration files).

### `focus_profiles` (1 row / user)
Settings + rolling psychological state.
- Preferences: `preferredSessionMinutes`, `preferredBreakMinutes`,
  `dailyGoalMinutes`, `chronotype` (`lark|owl|neutral`).
- Guards (on by default, opt-out): `blindPassEnabled`, `steelmanGuardEnabled`,
  `depletionGuardEnabled`, `gentleMode`.
- Kind streak: `currentStreakDays`, `longestStreakDays`, `graceTokens`,
  `lastSessionDate` (YYYY-MM-DD).
- Aggregates: `totalFocusMinutes`, `sessionsCompleted`.

### `focus_sessions`
One deep-work block.
- `intent` (implementation intention, required), `mode`
  (`review|read|write|triage`), `paperId?`, `plannedMinutes`.
- `status` (`active|completed|abandoned`).
- Reflection metrics: `depletionBefore/After` (1–5), `flowRating` (1–5),
  `focusScore` (0–100, derived), `actualFocusSeconds`, `interruptionCount`,
  `reflection`.
- Only **one** active session per user at a time (enforced in the route).

### `focus_events` (append-only)
`interruption | parked_thought | break_start | break_end | guard_shown |
guard_acknowledged`, with optional `note` and `payload` jsonb (payload is
internal, stripped from API responses).

## 4. Server

### Psychology engine — `artifacts/api-server/src/lib/focus.ts`
Pure, deterministic, **no I/O** (so it is trivially testable — see §7):
- `computeFocusScore` — 0–100 from completion × interruption penalty + flow.
- `recommendSession` — next length + break-first, with human-readable `reasons`
  (cumulative load, recent depletion, circadian fit) + `encouragement`.
- `assessReviewReadiness` — the verdict guard: returns `level`
  (`ok|caution|pause`), `warnings`, `suggestions`, `steelmanPrompt`. Never
  blocks (`ok` is true unless depleted + consequential).
- `steelmanPromptFor` — disconfirmation prompt per stance.
- `applyStreak` — kind-streak state machine.
- `reflectionFor` — short, honest, kind post-session line.
- Helpers: `clamp`, `localDateString`, `dayDiff`, `inPeakWindow`.

### Routes — `artifacts/api-server/src/routes/focus.ts`
All `requireAuth`. Profile auto-creates on first touch.
- `GET  /focus/dashboard` — profile + today's stats + recommendation + active + recent.
- `GET/PATCH /focus/profile`
- `GET/POST /focus/sessions`, `GET /focus/sessions/:id`
- `POST /focus/sessions/:id/events|complete|abandon`
- `GET  /focus/review-readiness?stance=&paperId=&blindPassDone=` — the guard.

## 5. API contract & codegen

Source of truth: `lib/api-spec/openapi.yaml`. Regenerate clients with:

```
pnpm --filter @workspace/api-spec run codegen
```

⚠️ **Repo quirk (now automated):** Orval 8.5.x types each hook's `query` option
as a full `UseQueryOptions`, which makes `queryKey` *required* and breaks every
page that passes only `{ enabled }`. The committed client had been hand-patched
to `Partial<UseQueryOptions<…>>`. That patch is now reproducible via
`lib/api-spec/patch-generated.mjs`, wired into the `codegen` script. If you
regenerate, the patch re-applies automatically (idempotent).

## 6. Frontend

`artifacts/scivet/src/pages/focus.tsx` (route `/focus`, nav + dropdown links in
`layout.tsx`). States:
- **Idle:** stat strip (streak / today / sessions / avg score), daily-goal
  progress, start form (intention, mode, length slider, depletion check-in),
  and a "Guard's advice" recommendation panel.
- **Active:** live count-up timer vs planned, interruption button, Zeigarnik
  parking lot, completion dialog (flow + depletion + reflection), no-penalty
  abandon.
- **Settings dialog:** chronotype, session/break/goal minutes, the four guards.

## 7. Status & gates

- `pnpm run typecheck` — ✅ green across all packages.
- `pnpm --filter @workspace/api-server run test` — ✅ 19/19 (pure engine;
  `node:test` + `tsx`, no extra deps).
- `pnpm --filter @workspace/scivet run build` — ✅ (needs `PORT` set).
- The verdict guard is **wired into the review flow** in `paper-detail.tsx`:
  casting opens a guard dialog (warnings, suggestions, required steelman for
  reject/challenge) and never hard-blocks.
- `mockup-sandbox` build fails for a **pre-existing** reason (requires `PORT`
  at vite-config load) — unrelated to Focus Guard.

See `ROUTINE.md` for the running log and the prioritised next-routine backlog.
