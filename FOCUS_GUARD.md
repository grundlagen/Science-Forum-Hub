# Focus Guard

> Protect one block of real attention. Set an intention, guard it, reflect.

Focus Guard is SciVet's deep-work companion. Reading a dense paper, writing
rigorous prose, and reviewing critically are the three hardest, most valuable
things a citizen scientist does on this platform — and all three are
catastrophically fragile to interruption. Focus Guard is a deliberately
psychology-led attempt to protect that scarce attention without turning it into
a slot machine of streaks and shame.

This document is the source of truth for the feature's intent, its schema, and
where it's going. For the running build journal (what each routine pass did and
what the next one should pick up), see [`ROUTINE_LOG.md`](./ROUTINE_LOG.md).

---

## Design principles (and the research behind them)

Every field in the schema earns its place by mapping to a finding from the
attention / motivation literature. We are not vibe-coding a Pomodoro timer.

| Principle | What it means here | Anchor in the literature |
|---|---|---|
| **Implementation intentions** | A session cannot start without a concrete `intention` ("Read the Methods and note 3 things I'd challenge"). The act of pre-committing *what* and *when* is the intervention. | Gollwitzer (1999), "Implementation intentions: Strong effects of simple plans." |
| **Specific, moderately hard goals** | `dailyGoalMinutes` and a single per-block intention beat "do your best." | Locke & Latham (2002), goal-setting theory. |
| **Flow** | `cadence`, `flowScore`, and hiding feedback noise all serve absorption: clear goal, immediate feedback, challenge≈skill. | Csikszentmihalyi (1990), *Flow*. |
| **Ultradian rhythm (BRAC)** | The `ultradian` 90/20 cadence respects the brain's natural ~90-min work/recovery cycle. | Kleitman's Basic Rest–Activity Cycle; Ericsson et al. (1993) on deliberate-practice session length. |
| **Attention Restoration** | Breaks are part of the work, not a reward for it. `energyBefore`/`energyAfter` track directed-attention fatigue and recovery. | Kaplan (1995), Attention Restoration Theory. |
| **Cognitive Load Theory** | The `guards` strip *extraneous* load: `hideFeed`, `muteNotifications`, `grayscale`. | Sweller (1988). |
| **Attention residue** | `muteNotifications` exists because even a glanced-at ping leaves residue that degrades the next task. | Leroy (2009), "Why is it so hard to do my work?" |
| **Zeigarnik effect / offloading** | The **parking lot** (`focus_distractions`) lets a user write down an intrusive thought instead of acting on it, discharging the tension that keeps it cycling in working memory. | Zeigarnik (1927); Masicampo & Baumeister (2011) on how *plans* to complete tasks release the cognitive load. |
| **Self-Determination Theory** | Sessions are self-set (autonomy), show honest progress (competence), and — later — can be shared with peers (relatedness). Never punitive. | Deci & Ryan (1985). |
| **Self-compassion / no "what-the-hell" effect** | `gentleMode` reframes abandoned blocks and broken streaks as data, not verdicts, to avoid the abstinence-violation effect that turns one slip into a collapse. | Neff (2003); Marlatt & Gordon (1985); Cochran & Tesser (1996). |
| **Habit formation (B=MAP)** | Short default blocks (25 min) keep the *ability* bar low so the behavior actually happens; streaks provide a gentle prompt, not a punishment. | Fogg (2009) Behavior Model; Clear, *Atomic Habits* (popular synthesis). |

The throughline: **make starting easy, make focus defensible, make reflection
cheap, and make slipping forgivable.** A tool that shames you into focus is a
tool you'll close.

---

## Data model

Three tables, in `lib/db/src/schema/focus.ts`.

### `focus_sessions`
A single bounded deep-work block. Opens with an `intention`, optionally tied to
a `paperId`. Carries a snapshot of the active `guards`, the chosen `cadence`,
and post-session self-ratings (`flowScore`, `energyBefore`/`energyAfter`,
`reflection`). `focusedSeconds` is the honest measure — paused time excluded.

### `focus_distractions` — the parking lot
Distractions captured *without acting on them*. `kind` classifies them
(internal thought / external interruption / task-switch urge / anxiety) so the
user learns their own distraction signature. `breached` records whether it
actually pulled them out; `resolved` closes the loop later.

### `focus_preferences`
One row per user (`userId` PK, mirroring `profiles`). Humane defaults: 25-minute
blocks, a 90-minute daily goal, guards on, and `gentleMode` **true** — that last
one is load-bearing psychology, not a nicety.

See the inline doc comments in `focus.ts`; they carry the per-field rationale.

---

## API

All endpoints require auth and operate on the current user only. Defined in
`lib/api-spec/openapi.yaml` (tag `focus`), implemented in
`artifacts/api-server/src/routes/focus.ts`.

| Method & path | Operation | Purpose |
|---|---|---|
| `GET /focus/preferences` | `getFocusPreferences` | Read prefs (creates defaults on first call). |
| `PUT /focus/preferences` | `updateFocusPreferences` | Update prefs. |
| `GET /focus/sessions` | `listFocusSessions` | List the user's sessions (filter by status). |
| `POST /focus/sessions` | `startFocusSession` | Open a block with a stated intention (starts active). |
| `GET /focus/sessions/{id}` | `getFocusSession` | One session + its parked distractions. |
| `PATCH /focus/sessions/{id}` | `updateFocusSession` | Advance lifecycle / record reflection. |
| `POST /focus/sessions/{id}/distractions` | `logFocusDistraction` | Park a distraction. |
| `PATCH /focus/sessions/{id}/distractions/{distractionId}` | `resolveFocusDistraction` | Mark parked item resolved. |
| `GET /focus/stats` | `getFocusStats` | Streak, today's minutes, totals, avg flow, breach rate. |

Stats (streak math, ART/flow aggregates) are computed in app code in
`artifacts/api-server/src/lib/focusHelpers.ts` — per-user volume is tiny and the
logic reads far clearer than window functions.

---

## Frontend

- **`artifacts/scivet/src/pages/focus.tsx`** — the whole experience: idle
  dashboard (start panel + today's stats + recent blocks), the live session view
  (timer, intention, parking lot, guard chips), and the post-session reflection.
- **`artifacts/scivet/src/hooks/use-focus-timer.ts`** — a persistent stopwatch
  anchored to wall-clock time in `localStorage`, so a refresh or backgrounded tab
  never costs the user their block (or their streak).
- Routed at `/focus`; linked from the header nav and the user menu (signed-in).

---

## Roadmap

Sequenced roughly by value-to-effort. The next routine should pull from the top.

1. **Preferences UI.** The backend & defaults exist; surface an editing panel
   (cadence, daily goal, guard toggles, gentle mode) on `/focus`.
2. **Actually enforce the guards.** Today `guards` are recorded but cosmetic.
   Wire `hideFeed` / `grayscale` / `muteNotifications` into the live app via a
   `FocusModeContext`, and add `blockExternal` navigation friction.
3. **Break timer & cadence loop.** Honor `breakMinutes`: prompt a restorative
   break when a work interval ends, then resume. Make breaks feel earned, not idle.
4. **"Focus this paper" entry points.** A button on paper-detail / paper-edit
   that starts a session pre-filled with `paperId` and an activity, closing the
   loop between the deep-work tool and the deep work.
5. **Insight surfacing.** Use the captured data: best time-of-day, which
   `kind` of distraction breaches most, flow-vs-energy trends. A weekly read-out.
6. **AI focus coach.** The repo already ships an OpenAI server integration
   (`lib/integrations-openai-ai-server`). Generate a short, kind, specific
   suggestion from the user's recent sessions ("your afternoon blocks breach 3×
   more — try mornings for review work").
7. **Relatedness (SDT).** Opt-in "focus rooms" / shared live sessions and gentle
   accountability — co-presence without surveillance.
8. **Per-user timezone for streaks.** Stats currently bucket by UTC day; let the
   client send its tz (or store it in prefs) so streaks line up with the user's
   actual midnight.

### Known sharp edges
- **Codegen + react-query v5.** Orval 8.5.3 emits query-option params as
  `UseQueryOptions<…>` (which requires `queryKey`), but the repo's committed
  client wraps them in `Partial<…>`. After any `pnpm --filter @workspace/api-spec
  run codegen`, re-apply that wrap (see `ROUTINE_LOG.md` for the one-liner) or the
  whole scivet app stops compiling.
- **DB migration.** New tables need `pnpm --filter @workspace/db run push`
  against a real database; not run in CI/sandbox.
