# Focus Guard

> *"What information consumes is rather obvious: it consumes the attention of its
> recipients."* — Herbert A. Simon (1971)

Focus Guard is SciVet's deep-reading companion. A science forum has a structural
conflict of interest: papers reward slow, effortful attention, while feeds reward
fast, twitchy attention. Focus Guard takes the reader's side. It lets a user open
a bounded, intentional reading session on a paper (or free study), captures the
intrusive thoughts that would otherwise pull them away, quiets the feed's
dopamine taps for the duration, and closes with honest, non-manipulative
feedback.

Every field in the schema and every endpoint exists because a specific,
replicated finding in attention psychology says it should. This document is the
source of truth for that mapping. If a future change can't cite its mechanism,
it doesn't ship.

---

## 1. The psychology, and what each finding buys us

### 1.1 Implementation intentions — Gollwitzer (1999)

Forming a concrete *"when situation X arises, I will do Y"* plan dramatically
increases goal attainment versus a vague intention (meta-analysis: Gollwitzer &
Sheeran 2006, d ≈ .65 across 94 studies). **Design consequence:** a session
cannot start without an `intention` — one sentence, in the user's own words,
stating what they will do ("I will read the methods section and decide whether
the sample size supports the claim"). The placeholder text models the
*I-will-verb-object* form. We store it and we show it back during the session;
the intention is the contract.

### 1.2 The Zeigarnik effect & the "parking lot" — Zeigarnik (1927), Masicampo & Baumeister (2011)

Unfinished tasks intrude on consciousness; *but* Masicampo & Baumeister showed
that merely **writing a specific plan** for the unfinished task eliminates the
intrusion — you don't have to do the thing, just externalize it. **Design
consequence:** the **capture pad**. During a session, any intrusive thought
("reply to Dana", "look up what a Bonferroni correction is") gets one keystroke
and a text field. It's stored as a `focus_capture`, hidden until the session
ends, then presented for triage. The thought is parked; the brain lets go.

### 1.3 Attentional residue — Leroy (2009)

Switching tasks leaves "attention residue": part of your mind is still
processing the prior task, and performance on the new task suffers. Residue is
worst when the prior task was left unfinished. **Design consequence:** sessions
have explicit *closure*. Ending a session is a ceremony, not a tab-close: you
declare an outcome, triage your captures, and write an optional one-line
`closingNote` ("where I left off / what's next"), which Leroy's follow-up work
("ready-to-resume" plans, Leroy & Glomb 2018) shows reduces residue carried
into the next thing you do.

### 1.4 Interruption cost — Mark, Gudith & Klocke (2008)

Observed knowledge workers take ~23 minutes to return to a task after an
interruption, and compensate for interruptions by working faster at the cost of
higher stress. **Design consequence:** during an active session the client
suppresses every non-critical surface (feed, counters, badges). The server
supports this with a single cheap endpoint (`GET /focus/sessions/active`) the
shell can poll to know "the user is in a session; render the quiet UI."

### 1.5 Ulysses contracts & precommitment — Schelling (1960), Ariely & Wertenbroch (2002)

People knowingly bind their future selves because they predict their own
weakness; *self-imposed* deadlines and locks work (Ariely & Wertenbroch's
binding-deadline study). The key word is *self-imposed* — externally forced
locks backfire (see §1.7). **Design consequence:** `lockMode` is chosen by the
user per session: `gentle` (a leaving prompt reminds you of your intention, one
click to leave) or `ulysses` (leaving early requires typing a short
`abandonReason` — friction calibrated to interrupt autopilot, not to imprison).
There is deliberately **no hard lock**. Odysseus asked to be tied to the mast;
he did not ask for the rope to be welded.

### 1.6 Flow & the challenge–skill balance — Csikszentmihalyi (1990)

Flow needs (a) clear goals, (b) immediate feedback, (c) a challenge that
slightly exceeds skill. (a) is the intention. (b) is the in-session timer and
the capture count. For (c), sessions can be linked to a `paperId`, and the
post-session summary asks one calibrated question — *"How did that feel?"*
(`tooEasy` / `engaged` / `overwhelmed`) — stored as `felt`, so duration
recommendations can adapt over time (overwhelmed → suggest shorter; too easy →
suggest longer or a harder paper).

### 1.7 Self-Determination Theory — Deci & Ryan (1985, 2000)

Intrinsic motivation requires **autonomy, competence, relatedness**; external
controls (surveillance, forced mechanics, guilt) corrode it. This is Focus
Guard's constitution, and it forbids the dark patterns of the "focus app"
industry:

- **No daily streaks.** Daily streaks are loss-aversion harnesses (Kahneman &
  Tversky 1979): miss one day and the asset you "owned" is destroyed, so the
  app punishes rest. We track a **weekly cadence** instead (`weeksActive`,
  computed) — any focused minutes in a week keeps the cadence, honoring rest
  days and the spacing effect (Cepeda et al. 2006: distributed practice beats
  massed practice anyway).
- **No shame copy.** An abandoned session's summary says what the data says
  ("You focused for 9 of 25 minutes and parked 3 thoughts") and never editorial
  ("You failed", a dead tree, a crying mascot).
- **User-owned goals.** `weeklyTargetMinutes` lives in `focus_settings`,
  default modest (90), user-editable, never auto-escalated.

### 1.8 Ultradian rhythms & restorative breaks — Kleitman's BRAC; Kaplan (1995)

Alertness cycles roughly every 90 minutes (basic rest–activity cycle);
attention is a depletable-then-restorable resource, and Kaplan's Attention
Restoration Theory finds restoration in *soft fascination* (undemanding,
gently interesting stimuli) — not in a feed, which is directed-attention work
wearing a leisure costume. **Design consequence:** planned durations are
clamped to **10–90 minutes** (default 25, the Pomodoro convention — Cirillo's
contribution is not magic in 25 but in *bounded with mandated breaks*). The
post-session summary computes a suggested break (`suggestBreakMinutes`,
roughly duration/5, min 5) and the break copy suggests soft-fascination
activities (window, walk, water) and explicitly *not* the feed.

### 1.9 Goal-gradient effect — Hull (1932), Kivetz, Urminsky & Zheng (2006)

Effort accelerates near a goal (true in rats and in café loyalty cards).
**Design consequence:** the in-session UI shows time **remaining toward the
intention's end**, and weekly stats show progress toward `weeklyTargetMinutes`
as a fraction — both gradients pointed at goals the user chose. We use the
gradient to finish sessions, never to extend them ("just 5 more minutes to
beat yesterday!" is exactly the manipulation we refuse).

### 1.10 Fresh-start effect — Dai, Milkman & Riis (2014)

Temporal landmarks (Mondays, month starts) boost aspirational behavior.
**Design consequence:** stats are framed Monday-to-Monday (`weekStart` in
stats responses), so every week is a clean slate and an abandoned Tuesday
doesn't poison the narrative until Sunday.

### 1.11 The feed is a variable-ratio schedule — Skinner (1957), by way of every growth team since

Variable-ratio reinforcement (rewards after an unpredictable number of
responses) produces the highest, most extinction-resistant response rates —
it's the slot-machine schedule, and pull-to-refresh feeds replicate it
faithfully. Focus Guard can't reform the feed, but during a session the client
treats it as hostile territory: hidden behind the active-session state. The
honest framing for users: *it's not that you're weak; it's that the machine is
calibrated.*

---

## 2. Schema (the part the database believes)

Three tables, deliberately small. Names follow the workspace convention
(`pgTable`, snake_case columns, `$type<>` unions for enums-as-text).

### `focus_sessions`
| column | type | psychology |
|---|---|---|
| `id` | serial PK | — |
| `user_id` | text, indexed | — |
| `paper_id` | integer, nullable | flow: clear object of attention (§1.6); null = free study |
| `intention` | text, required, 3–280 chars | implementation intention (§1.1) |
| `planned_minutes` | integer, 10–90 | bounded session, ultradian clamp (§1.8) |
| `lock_mode` | `'gentle' \| 'ulysses'` | self-imposed precommitment (§1.5) |
| `started_at` | timestamptz | — |
| `ended_at` | timestamptz, nullable | null = active |
| `outcome` | `'completed' \| 'abandoned' \| 'overran' \| 'expired'`, nullable | honest closure (§1.3); `expired` = walked away, swept later |
| `actual_seconds` | integer, nullable | what actually happened, not what was planned |
| `felt` | `'too_easy' \| 'engaged' \| 'overwhelmed'`, nullable | challenge–skill calibration (§1.6) |
| `abandon_reason` | text, nullable | ulysses friction (§1.5) |
| `closing_note` | text, nullable | ready-to-resume plan (§1.3) |
| `created_at` / `updated_at` | timestamptz | convention |

One **partial unique index** on `user_id WHERE ended_at IS NULL`: a person has
exactly one attention; the database agrees.

### `focus_captures`
| column | type | psychology |
|---|---|---|
| `id` | serial PK | — |
| `session_id` | integer, indexed | — |
| `user_id` | text | denormalized for cheap stats |
| `body` | text, 1–500 chars | the parked thought (§1.2) |
| `kind` | `'thought' \| 'todo' \| 'lookup'` | triage affordance |
| `captured_at` | timestamptz | — |
| `resolved_at` | timestamptz, nullable | triaged after closure (§1.3) |
| `resolution` | `'done' \| 'kept' \| 'let_go'`, nullable | "let it go" is a first-class outcome — most parked thoughts deserve it |

### `focus_settings`
| column | type | psychology |
|---|---|---|
| `user_id` | text PK | — |
| `default_minutes` | integer, default 25 | Pomodoro convention (§1.8) |
| `default_lock_mode` | default `'gentle'` | autonomy first (§1.7) |
| `weekly_target_minutes` | integer, default 90 | user-owned goal (§1.7, §1.9) |
| `quiet_feed` | boolean, default true | variable-ratio defense (§1.11) |
| `created_at` / `updated_at` | timestamptz | convention |

**What is deliberately absent:** daily streak counters, XP, leagues,
leaderboards, public focus stats, notification-bait columns. Their absence is
load-bearing (§1.7).

## 3. API surface

| method & path | purpose |
|---|---|
| `GET /focus/settings` | read settings (creates defaults on first touch) |
| `PUT /focus/settings` | update settings |
| `POST /focus/sessions` | begin session (intention required; 409 if one is active) |
| `GET /focus/sessions/active` | the shell's "are we focusing?" poll |
| `POST /focus/sessions/{id}/end` | the closure ceremony: outcome, felt, closing note |
| `POST /focus/sessions/{id}/captures` | park a thought (only while active) |
| `GET /focus/sessions/{id}/captures` | list captures for triage |
| `POST /focus/captures/{id}/resolve` | done / kept / let_go |
| `GET /focus/sessions` | history (recent, with capture counts) |
| `GET /focus/stats` | this week vs target, cadence, completion rate, capture honesty |

Sessions whose planned time elapsed long ago (grace: planned + 30 min) are
swept to `expired` lazily on the next read — no cron required, no lying stats.

## 4. Pure logic (`lib/focusGuard.ts` in api-server)

All psychology-derived arithmetic lives in one dependency-free module so it can
be unit-tested without a database: duration clamping, outcome derivation
(completed vs abandoned vs overran by ratio of actual to planned), suggested
break length, weekly aggregation with Monday boundaries, and the copy deck
(closure messages keyed by outcome — factual, warm, never shaming).

## 5. Client (scivet)

- **`/focus` page** — start a session (intention input with I-will scaffold,
  duration slider 10–90, lock mode toggle, optional paper link), the live
  session view (remaining-time gradient, intention echoed, capture pad), the
  closure ceremony (outcome, felt, captures triage), and weekly stats.
- **Quiet shell** — `Layout` consults the active session; while focusing, nav
  links to feed/explore dim and route guards interpose a gentle "you said you
  would…" prompt (gentle mode) or the abandon-reason field (ulysses mode).

## 6. Roadmap (full development arc)

- **v0 (this iteration):** schema, API, pure logic + tests, OpenAPI + codegen,
  focus page MVP (start → live → closure → stats).
- **v1:** quiet-shell integration in `Layout`; per-paper "focus on this paper"
  button on `paper-detail`; capture triage UX polish.
- **v2:** adaptive duration suggestions from `felt` history (challenge–skill
  loop, §1.6); fresh-start nudge copy on Mondays (§1.10).
- **v3:** reading-position bookmarks in `closing_note` (structured
  ready-to-resume); optional gentle haptic/audio session end.
- **Never:** daily streaks, public leaderboards, infinite-scroll anywhere near
  the session view, "your friends focused more than you."

## 7. References

- Ariely, D. & Wertenbroch, K. (2002). Procrastination, deadlines, and performance. *Psych. Science*.
- Cepeda, N. et al. (2006). Distributed practice in verbal recall tasks. *Psych. Bulletin*.
- Csikszentmihalyi, M. (1990). *Flow*.
- Dai, H., Milkman, K. & Riis, J. (2014). The fresh start effect. *Management Science*.
- Deci, E. & Ryan, R. (2000). Self-determination theory. *Psych. Inquiry*.
- Gollwitzer, P. (1999). Implementation intentions. *American Psychologist*; Gollwitzer & Sheeran (2006) meta-analysis.
- Hull, C. (1932). The goal-gradient hypothesis. *Psych. Review*; Kivetz, Urminsky & Zheng (2006). *JMR*.
- Kahneman, D. & Tversky, A. (1979). Prospect theory. *Econometrica*.
- Kaplan, S. (1995). Attention restoration theory. *J. Environmental Psych.*
- Leroy, S. (2009). Why is it so hard to do my work? Attention residue. *OBHDP*; Leroy & Glomb (2018).
- Mark, G., Gudith, D. & Klocke, U. (2008). The cost of interrupted work. *CHI*.
- Masicampo, E. & Baumeister, R. (2011). Consider it done! Plan making eliminates Zeigarnik intrusions. *JPSP*.
- Simon, H. (1971). Designing organizations for an information-rich world.
- Zeigarnik, B. (1927). Über das Behalten von erledigten und unerledigten Handlungen.
