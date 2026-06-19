# Focus Guard — Routine Check & Living Design Log

> A psychology-grounded deep-work companion for the Science Forum Hub.
> This file is the **single source of continuity** between development routines.
> Read it first, work, then update the "Routine Log" and "Next Routine" sections
> before you commit. Keep going until it's fully fledged.

---

## 0. What Focus Guard is (and is not)

The Hub is where people do genuinely hard cognitive work: reading dense papers,
writing rigorous reviews, verifying proofs, synthesizing literature. All of that
is attention-hungry and easily derailed. **Focus Guard helps a researcher
*protect* a block of attention and then *learn* from it.**

It is **not** a gamified dopamine treadmill. Every mechanic is chosen to lower
the friction of doing focused work and to give honest, non-punitive feedback —
never to manufacture compulsion. Where a "best practice" growth tactic conflicts
with the user's actual wellbeing (streak panic, infinite-hours hustle), we side
with wellbeing on purpose. See §3 for the explicit anti-dark-pattern stances.

---

## 1. The psychology this is built on

Every function in `@workspace/focus-engine` traces back to a specific result.
The `basis` strings in the code mirror this table.

| Principle | Source (informal) | Where it shows up |
|---|---|---|
| **Implementation intentions** — "I will [action] on [object]" ~doubles follow-through | Gollwitzer 1999; Gollwitzer & Sheeran 2006 (meta) | `assessIntention()` — required, scored intention before any timer |
| **Goal-setting theory** — specific + hard goals beat "do your best" | Locke & Latham 2002 | intention scoring rewards a measurable finish line; planned minutes |
| **Flow** — challenge/skill balance, clear goals, immediate feedback; interrupting flow is costly | Csikszentmihalyi 1990 | flowtime preset, flow self-rating, milestone events, focus-score feedback |
| **Ultradian / BRAC** — ~90-min natural work–rest cycles | Kleitman | `ultradian` preset (90/20) |
| **Pomodoro** — short repeatable sprints lower activation energy of starting | Cirillo | `pomodoro` preset (25/5) |
| **Deep Work** — long, single-task, distraction-free blocks | Newport | `deep_work` preset (120/25) |
| **Attention Restoration Theory** — directed attention fatigues and needs restful breaks | Kaplan & Kaplan 1989 | `recommendBreak()`, break scheduling, "walk not scroll" copy |
| **Attention residue** — switching tasks before finishing degrades the next task | Leroy 2009 | `decideContextSwitch()` (the "guard"), park-a-thought flow |
| **Zeigarnik effect** — unfinished tasks intrude; *writing them down* releases the loop | Zeigarnik 1927 | `parked_thought` event — penalised ~4× less than a chased distraction |
| **Self-Determination Theory** — autonomy/competence/relatedness drive intrinsic motivation | Deci & Ryan 2000 | user picks technique (autonomy); specific competence feedback; (relatedness = future) |
| **Non-controlling feedback** — specific informational feedback supports motivation; contingent praise/shame erodes it | Deci, Koestner & Ryan 1999 | `buildReflection()` — factual, one lever, never shaming, never a zero-everywhere |
| **Chronotype / "When"** — analytic work is best at your circadian peak | Pink 2018; Horne-Östberg MEQ | `isPeakWindow()`, peak-aware `recommendBlock()` guidance |
| **Environment design > willpower** — reduce friction/temptation rather than rely on grit | self-control / situational-strategies literature | guard `strict` removes the choice; `muteNotifications` |
| **Habit formation** — consistency over intensity; one missed day ≠ reset | Lally et al. 2010; Fogg 2019 | `computeStreaks()` with one-day **grace**; qualifying-minutes threshold |
| **Recovery prevents burnout** — psychological detachment sustains performance | Sonnentag 2003 | `adviseDailyLoad()` ceiling that nudges *rest*, not more hours |

---

## 2. Architecture (current state)

```
lib/focus-engine/            ← PURE psychology. No db, no clock, no network.
  src/types.ts                 shared vocabulary (unions)
  src/techniques.ts            presets + recommendBlock() + isPeakWindow()
  src/intention.ts             assessIntention()  (implementation intentions)
  src/scoring.ts               computeFocusScore(), recommendBreak(), decideContextSwitch()
  src/streaks.ts               computeStreaks() (grace), adviseDailyLoad()
  src/reflection.ts            buildReflection()  (non-controlling debrief)
  src/index.ts                 barrel
  src/engine.test.ts           16 node:test cases (pnpm --filter @workspace/focus-engine test)

lib/db/src/schema/focus.ts   ← Drizzle tables: focus_sessions, focus_events, focus_preferences
lib/api-spec/openapi.yaml    ← 12 /focus/* operations + ~30 component schemas (source of truth)
lib/api-zod/...generated     ← regenerated zod validators (server uses these)

artifacts/api-server/src/
  lib/focusGuard.ts            db<->engine glue, serializers, getOrCreatePreferences()
  routes/focus.ts              the 12 endpoints; wires HTTP → engine → db
  routes/index.ts              registers focusRouter
```

**Design rule that must be preserved:** the engine stays pure and
deterministic so it runs identically on the server (scoring) and in the browser
(live intention feedback, ticking break timer). Callers pass facts in; the
engine returns judgement + copy. Don't reach for `Date.now()`/`db`/`fetch` inside
`lib/focus-engine`.

---

## 3. Deliberate anti-dark-pattern stances (do not "optimize" these away)

1. **Grace on streaks.** One missed day is bridged once per run. We never show
   loss-aversion panic to juice engagement.
2. **A daily ceiling that says stop.** Past `dailyGoalMinutes` we praise *less*
   and nudge recovery. More hours ≠ better.
3. **Parked thoughts are a skill, not a failure.** Managing an intrusion costs
   far less than chasing it. This teaches the Zeigarnik move.
4. **No zero-everywhere score.** An honest scattered session still scores >0 and
   the headline is encouraging ("the next start is the win").
5. **The guard always allows breaks and on-target navigation.** It guards focus,
   it doesn't imprison the user.

---

## 4. API surface (all under `/api`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/focus/techniques` | no | Technique presets + their psychological basis |
| POST | `/focus/intention/assess` | no | Score an intention live; suggestions |
| POST | `/focus/recommend` | no | Adapt a work/break block to mode/energy/chronotype |
| POST | `/focus/guard/check` | no | allow / warn / block a context switch |
| GET | `/focus/preferences` | yes | Get (or create) the user's guard config |
| PUT | `/focus/preferences` | yes | Update guard config |
| POST | `/focus/sessions` | yes | Start a session from an intention (scores it) |
| GET | `/focus/sessions` | yes | List user's sessions (filter by `state`, `limit`) |
| GET | `/focus/sessions/{id}` | yes | Session + event timeline |
| POST | `/focus/sessions/{id}/events` | yes | Log distraction / parked_thought / milestone / note |
| POST | `/focus/sessions/{id}/complete` | yes | Compute focus score + reflective debrief |
| GET | `/focus/stats` | yes | Streak, daily-load advice, lifetime totals |

---

## 5. How to work on this (commands)

```bash
pnpm install                                   # link workspace (focus-engine is a package)
pnpm --filter @workspace/api-spec run codegen  # AFTER editing openapi.yaml — regenerates zod (+react)
pnpm --filter @workspace/focus-engine test     # run the 16 engine tests
pnpm run typecheck                             # full monorepo typecheck (must be green)
pnpm --filter @workspace/db run push           # apply focus_* tables to a dev DB (needs DATABASE_URL)
```

### ⚠️ Known landmine: orval / react-query drift
`pnpm ... codegen` runs **two** targets: `zod` (server needs it) **and**
`api-client-react`. With the currently-installed toolchain, the react target
regenerates `UseQueryOptions<…>` **without** the `Partial<…>` wrapper that the
committed `artifacts/scivet` pages rely on, which breaks `scivet`'s typecheck.

This routine therefore committed **only the `lib/api-zod` regen** and restored
`lib/api-client-react/src/generated` to HEAD (`git checkout HEAD -- …`). If you
regenerate, do the same, **or** fix the root cause first (pin the react-query /
orval versions, or update the scivet pages to pass an explicit `queryKey`).
Until that's fixed, the react client has **no** focus hooks yet — that's why the
frontend work below is still open.

---

## 6. Roadmap to "fully fledged"

Status: ✅ done · 🚧 in progress · ⬜ not started

### Routine 001 (this one) — engine + schema + API ✅
- ✅ Pure `@workspace/focus-engine` with 6 modules + 16 passing tests
- ✅ `focus_sessions` / `focus_events` / `focus_preferences` Drizzle schema
- ✅ 12 OpenAPI operations + zod validators
- ✅ Full route layer wired into the server; typecheck + build green

### Next up (pick from here)
- ⬜ **Fix the orval/react-query drift** (§5) so the generated React hooks compile,
      then regenerate `api-client-react` and commit the focus hooks.
- ⬜ **Frontend (scivet/mockup):** a "Start Focus" entry on a paper page →
      intention box with **live `assessIntention` feedback as you type** →
      active-session bar with timer, break prompt (`recommendBreak`), and
      "park a thought" / "log distraction" buttons → completion modal showing
      the score breakdown + reflection. A `/focus` dashboard with streak + stats.
- ⬜ **Wire the guard into navigation:** when `state === "active"` and the user
      navigates off the `targetPaperId`, call `/focus/guard/check`; honour
      allow/warn/block per `guardLevel`. Park-the-thought as the escape hatch.
- ⬜ **Notification muting:** when `muteNotifications` and a session is active,
      suppress hub toasts/badges; show a small "guarded" indicator.
- ⬜ **Seed data:** add a few `focus_sessions` for seed users in
      `artifacts/api-server/scripts/seed.ts` so the dashboard isn't empty.
- ⬜ **DB migration:** decide migrations vs. `drizzle-kit push`; the three tables
      are not yet applied to any environment.
- ⬜ **`pomodoro` cycle tracking:** sessions currently model one block; consider a
      `cyclesCompleted` counter and long-break logic from the preset.
- ⬜ **Relatedness (SDT):** optional, privacy-respecting "N researchers focusing
      now" presence, or shareable session recaps. Opt-in only.

### Bigger bets (think before building)
- ⬜ **Adaptive recommendations:** learn a user's real best block length / peak
      hour from their own completed-session history instead of static presets.
- ⬜ **"Review sprints":** a Focus Guard mode tuned to the Hub's review backlog —
      pull an open review needing attention as the session target.
- ⬜ **Honest analytics:** trends that inform without nagging (e.g., "your depth
      scores are highest in the morning") — keep §3 in mind.

---

## 7. Invariants / definition of done for any change here
- `pnpm run typecheck` is green across all projects (incl. `scivet`).
- `pnpm --filter @workspace/focus-engine test` passes; add a test for new logic.
- The engine stays pure (no db/clock/network imports).
- New endpoints follow the existing route pattern (`safeParse` → 400; `requireAuth`).
- §3 stances are respected. If you must trade one off, say why in the Routine Log.

---

## 8. Routine Log

### Routine 001 — 2026-06-19
**Did:** Established Focus Guard from nothing. Built the pure engine (techniques
& peak windows, intention scoring, focus scoring, break advice, attention-residue
guard, forgiving streaks, daily-load recovery nudge, non-controlling reflection),
16 tests, the DB schema, the OpenAPI surface + zod, the glue lib, and all 12
routes wired into the server. Full typecheck + server build green; tests pass.

**Caught a real bug via smoke test:** low-energy "writing" recommended a 120-min
block while the guidance said "go shorter" — added an energy ceiling so the
number agrees with the advice. (Regression-tested.)

**Punted (on purpose):** the `api-client-react` regen breaks `scivet` due to an
orval/react-query `Partial<>` drift unrelated to this feature (§5). Committed only
the zod regen and restored the react client. Frontend + guard-in-navigation are
the headline items for Routine 002.

**Next routine, start here:** §5 (fix the drift), then the frontend item in §6.

<!-- Routine 002 — append above this line. Keep the log newest-first or append; just be consistent. -->
