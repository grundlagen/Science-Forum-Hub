# Focus Guard — Routine Log & Roadmap

> This is the living hand-off document for the **Focus Guard** subsystem of
> SciVet (the Science Forum Hub). Each "routine" is a focused work session that
> reads this file, advances the feature, and updates this file for the next one.
> **If you are the next routine: start here.**

---

## 0. TL;DR for the next routine

Focus Guard is a psychology-grounded system that protects the *quality of
attention* a reviewer brings to a paper. Peer review is a System‑2 task done by
fatigue-prone humans; Focus Guard measures genuine engagement, weighs reviews by
it, and (opt‑in) gates low-focus or fatigued judgements.

**Status: Routine 1 complete — vertical slice shipped end-to-end and green.**
DB schema + pure psychology engine (23 passing tests) + REST API + live
front-end hook & panel + CI test step. Enforcement defaults **off** (advisory),
so nothing in the existing flow breaks.

Pick up at **§6 Roadmap → "Next routine"**.

---

## 1. The idea (why this exists)

A peer-review platform is only as good as the judgement behind its votes. Two
failure modes quietly corrode that:

1. **Drive-by reviewing.** A vote cast after 8 seconds of skimming counts exactly
   as much as one cast after 20 minutes of careful reading. That is a
   cognitive-miser shortcut (Fiske & Taylor, 1991) — cheap System‑1 verdicts
   dressed as deliberation (Kahneman, 2011).
2. **Decision fatigue.** Judgement quality (and even direction) degrades over an
   unbroken run of decisions and recovers after a break — the "hungry judge"
   effect (Danziger, Levav & Avnaim‑Pesso, 2011, *PNAS*).

Focus Guard turns attention into a first-class signal: it tracks engaged time,
scroll coverage, and context-switching; scores each session; weighs reviews by
that score; and nudges (or, opt-in, blocks) when judgement is unlikely to be
reliable — e.g. you've reviewed five papers without a break.

The design ethic: **protect attention, don't harvest it.** Nudges never stack,
flow is sacred (we go quiet during it), and the default posture is advisory.

## 2. Psychological basis (every constant is a citation)

See `artifacts/api-server/src/lib/focusGuard/constants.ts` — each value carries
its source. Summary:

| Concept | Source | Where it lands |
| --- | --- | --- |
| Basic Rest–Activity Cycle (~90 min ultradian) | Kleitman, 1963 | `ULTRADIAN_CYCLE_MIN`, ultradian-break nudge |
| Attention Restoration Theory | Kaplan, 1995 | restorative break length, "take 5" |
| Decision fatigue / hungry judges | Danziger et al., 2011 | `DECISION_FATIGUE_REVIEW_LIMIT`, fatigue state & gate |
| System 1/2, cognitive miser | Kahneman 2011; Fiske & Taylor 1991 | min engagement floor, coverage gate |
| Flow | Csikszentmihalyi, 1990 | flow detection → suppress all nudges |

## 3. Architecture (single source of truth = the engine)

```
lib/db/src/schema/
  focusSessions.ts          # raw signals per reading/review episode
  focusGuardProfiles.ts     # per-user settings + rolling fatigue/streak aggregates
  reviews.ts                # + focusScore column (attention behind each vote)

artifacts/api-server/src/lib/focusGuard/   # PURE engine, no I/O, fully tested
  constants.ts  types.ts  engine.ts  index.ts  engine.test.ts
artifacts/api-server/src/lib/focusGuardService.ts  # DB-aware shell over engine
artifacts/api-server/src/routes/focus.ts           # REST surface
artifacts/api-server/src/routes/reviews.ts         # integrated: weigh + gate

artifacts/scivet/src/
  lib/focus-guard-client.ts   # fetch wrappers + types (mirror of server)
  hooks/use-focus-guard.ts    # measures attention, streams heartbeats
  components/focus-guard.tsx  # live focus dial + single nudge + break button
  pages/paper-detail.tsx      # panel wired into the review box
```

**Rule:** all scoring/judgement lives in the pure engine. The DB, routes, and
client are thin shells. Keep it that way — it's why the engine is exhaustively
unit-testable and could later run client-side for optimistic UI.

## 4. Data model

`focus_sessions` — one bounded engagement episode. Stores **raw additive
signals** (activeMs, idleMs, scrollDepth, distractionEvents, breaksTaken), never
derived verdicts, so scoring can evolve without migration. `focusScore` +
`ultradianPhase` are computed at end-of-session.

`focus_guard_profiles` — one row per user: opt-in **settings**
(`enforcementEnabled`, `minReviewEngagementSec`, ultradian/fatigue toggles,
`dailyFocusGoalMin`) and rolling **aggregates** (`reviewsSinceBreak`,
`lastBreakAt`, streaks, totals) the fatigue model needs.

`reviews.focusScore` — nullable; the focus quality of the session that produced
each vote. Enables future attention-weighted community scoring.

> **DB note:** schema changes are not yet pushed. Run
> `pnpm --filter @workspace/db run push` against a dev DB. No SQL migration files
> exist in this repo (drizzle `push` workflow). See §7.

## 5. API surface (all under `/api`, auth required)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/focus/sessions` | start a session `{paperId?, intent}` |
| `PATCH` | `/focus/sessions/:id` | heartbeat (monotonic max-merge of signals) |
| `POST` | `/focus/sessions/:id/end` | end, compute score (sendBeacon-friendly) |
| `GET` | `/focus/guard/:paperId` | eligibility + fatigue + nudge + focusScore |
| `GET` | `/focus/me` | guard profile (settings + aggregates) |
| `PATCH` | `/focus/me/settings` | update guardrail settings |
| `POST` | `/focus/break` | record a restorative break (resets fatigue) |

`POST /papers/:id/reviews` now: looks up the best session, **stamps
`focusScore`** on the review, advances the fatigue counter on new (not edited)
reviews, and returns 409 with the guard reason **only when the user enabled
enforcement**.

Validation is intentionally dependency-free (small coercion helpers) because
`api-server` has no direct `zod` dep and these routes aren't in the OpenAPI spec
yet (see §6).

## 6. Roadmap

### ✅ Routine 1 (this one) — vertical slice
- [x] DB schema: `focusSessions`, `focusGuardProfiles`, `reviews.focusScore`
- [x] Pure engine: focus score, ultradian phase, fatigue, eligibility, weighting, nudges
- [x] 23 unit tests, all green; wired into root `test` script + CI
- [x] Service layer (DB ↔ engine) with monotonic heartbeats & race-safe profile upsert
- [x] REST routes + review integration (weigh always, gate opt-in)
- [x] Front-end: client, tracking hook, live panel, paper-detail wiring
- [x] Full `pnpm run typecheck` green

### ▶ Next routine — pick the top unchecked item
1. **Persist & verify against a real DB.** Run drizzle `push`; smoke-test the
   endpoints with a seeded user/paper. Add an integration test or a scripted
   curl walkthrough. (Engine is unit-tested; the DB shell is not yet exercised.)
2. **Attention-weighted community score.** Feed `reviewWeight(review.focusScore)`
   into `promotion.ts::communityScore` so deep-focus endorsements move a paper
   more than drive-bys. Currently `focusScore` is *recorded but not yet used* in
   stage computation — close that loop. Keep weights gentle (0.5–1.25) and
   never silence a voice.
3. **Settings UI** on `/me`: enforcement toggle, engagement floor, daily goal,
   streak display. Backend (`/focus/me*`) already exists.
4. **OpenAPI + generated client.** Add the focus endpoints to
   `lib/api-spec/openapi.yaml`, regenerate (`pnpm --filter @workspace/api-spec
   run codegen`), and swap the hand-rolled `focus-guard-client.ts` for generated
   hooks. Then delete the bespoke fetch layer.
5. **Focus history / insights.** A small dashboard: focus over time, best
   ultradian window, fatigue patterns. The raw signals already support it.

### Later / stretch
- "Deep work" reading mode that hides vote buttons until the coverage gate is met.
- Reviewer reputation that blends focus quality with track record.
- Circadian-aware nudges (morning vs. late-night reviewing).
- Respect `prefers-reduced-motion`; accessibility pass on the dial/nudges.
- Privacy: make tracking explicitly consented + documented; never log content.

## 7. Known gaps / decisions to revisit
- **No DB migration files**: repo uses drizzle `push`. New tables exist only in
  code until pushed. Don't assume they're live.
- **Streak/goal aggregation in `rollUpProfile` is approximate** (uses lifetime
  total as a proxy for "today"). Fine for a gentle streak; revisit if it becomes
  user-visible and needs to be exact (would need per-day rollups).
- **`focusScore` not yet in stage math** — recorded only (roadmap #2).
- **Front-end client duplicates server types** — intentional until OpenAPI
  codegen (roadmap #4), then collapse.
- Enforcement is **off by default** by design — Focus Guard earns trust as an
  advisor before it's allowed to block.

## 8. How to run / verify
```bash
pnpm install
pnpm run typecheck                      # whole workspace — must be green
pnpm --filter @workspace/api-server test # 23 engine tests
pnpm run test                            # same, via root aggregator
# DB (dev): pnpm --filter @workspace/db run push
```

## 9. Routine history
- **Routine 1 (2026‑06‑20):** Conceived and built Focus Guard end-to-end —
  schema, tested engine, API, front-end, CI. Established this log.
