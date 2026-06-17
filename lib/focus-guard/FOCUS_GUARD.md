# Focus Guard

> A reviewer attention-integrity engine for SciVet.

Peer review is the heart of SciVet, and the things that wreck it are rarely
technical — they are psychological. Reviewers anchor on the AI verdict, herd
toward the running vote, judge papers they have skimmed, and get harsher and
noisier as a long sitting wears on. **Focus Guard protects the one input the
platform cannot manufacture and review depends on: a clear, independent,
well-rested mind.**

It is not a productivity timer bolted onto the side of the app. It is a set of
five guards, each closing a specific, well-documented failure mode of human
judgment, composed into a single decision: *can this reviewer cast a trustworthy
verdict right now, and what should they see while they do?*

---

## The five guards

| Guard | Failure mode it closes | Key evidence |
|-------|------------------------|--------------|
| **Blind-First** | Anchoring & herding — seeing the AI verdict / votes / other reviews contaminates an independent judgment. | Tversky & Kahneman 1974 (anchoring); Asch 1956 (conformity); herding in review scores. |
| **Reading-Commitment** | Shallow engagement — judging work that was never actually read. | Gabielkov et al. 2016 (~59% of shared links never opened); Zajonc 1968 (mere exposure ≠ comprehension); Duggan & Payne 2009 (skim comprehension). |
| **Fatigue** | Decision fatigue & ego depletion — quality and consistency decay across a sitting. | Danziger, Levav & Avnaim-Pesso 2011 ("hungry judges"); Baumeister et al. 1998. |
| **Residue** | Attention residue — switching papers before the last one closes impairs the next. | Leroy 2009. |
| **Flow / Ultradian** | Interrupting deep focus, and pushing past the body's natural work cycle. | Csikszentmihalyi 1990 (flow); Kleitman (Basic Rest–Activity Cycle, ~90 min). |

### Blind-First Guard
Until a reviewer commits an **independent stance**, every social and machine
signal is withheld: the AI verdict, the rigor score, the vote tally, and other
reviewers' stances. The moment they commit, everything is revealed so genuine
discussion and revision can follow. Blindness is the default; transparency is
the reward for having formed your own view first.

### Reading-Commitment Guard
The verdict control stays **locked** until the reviewer demonstrates contact with
the paper: enough *dwell time* (scaled to the paper's length at ~238 wpm) and
enough *coverage* (scroll depth). Short papers still require a hard floor
(45 s); long papers are capped (12 min) so the guard never becomes punitive.

### Fatigue Guard
A 0..1 fatigue score blends three contributors — continuous time on task,
number of verdicts already committed, and the time-of-day circadian penalty
(post-lunch dip + nocturnal trough, shifted by chronotype). Breaks both reset
the time term and forgive some decision load. High fatigue recommends a break
and **discounts** any verdict cast (trust is floored at 0.4, never voided).

### Residue Guard
After closing a paper, a brief enforced cooldown (20 s) must elapse before the
next verdict unlocks — turning an abrupt context switch into a deliberate one.

### Flow / Ultradian Guard
Tracks the continuous-focus streak. While genuinely *in flow*, only urgent
prompts are allowed through — Focus Guard refuses to interrupt good work. At the
~90-minute ultradian boundary, a restorative break becomes due and fires an
urgent nudge.

---

## Architecture

```
@workspace/focus-guard (this package)   — PURE engine, zero I/O
  src/constants.ts   psychological parameters, every one cited
  src/types.ts       Zod input schemas + plain output types
  src/engine/        one module per guard + circadian + math + orchestrator
  src/selfCheck.ts   executable spec: invariants as a pure assertion battery
  test/run.ts        thin runner (esbuild + node)

@workspace/db (lib/db/src/schema/focusSessions.ts)  — persistence
  focus_sessions     rolling per-sitting counters the engine reads
  focus_events       append-only log the counters are folded from
```

The engine never reads the clock, the database, or the environment. The caller
passes `now` (epoch ms) and a snapshot; the engine returns a `FocusAssessment`.
This makes every guard deterministic and the whole thing testable without
mocks — see `selfCheck()`.

### Core call

```ts
import { assessFocus } from "@workspace/focus-guard";

const assessment = assessFocus({
  now: Date.now(),
  session: { startedAt, reviewsCompleted, breaksTaken, lastBreakEndedAt, lastPaperClosedAt },
  engagement: { paperId, openedAt, wordCount, scrollCoverage, dwellMs, stanceCommitted },
  localHour: 14.5,
  chronotype: "neutral",
});

assessment.canCommitVerdict; // boolean — gate the "Cast review" button
assessment.blind.hidden;     // Signal[] — what the UI must mask
assessment.reading.progress; // 0..1 — drive the reading meter
assessment.fatigue.band;     // "fresh" | "steady" | "tiring" | "depleted"
assessment.verdictIntegrity; // 0..1 — store alongside the review
assessment.nudges;           // prioritised, flow-aware prompts
```

---

## Verifying

```bash
pnpm --filter @workspace/focus-guard run verify   # runs selfCheck()
pnpm run typecheck:libs                            # whole-monorepo typecheck
```

`selfCheck()` is the living contract. When you change behaviour, add a case.

---

## Roadmap

- **Phase 1 — Foundation (done):** pure engine, DB schema, self-check.
- **Phase 2 — API:** OpenAPI operations (`/focus/session`, `/focus/events`,
  `/focus/assessment`), server handlers that fold `focus_events` into
  `focus_sessions` and call `assessFocus`, persist `verdictIntegrity` on reviews.
- **Phase 3 — UI:** React hooks (`useFocusGuard`) + components — reading meter,
  blind overlay on signals, fatigue HUD, break prompts, flow indicator.
- **Phase 4 — Calibration:** instrument real sessions, fit the constants to
  observed review-quality outcomes, A/B the guards, expose per-user settings.

See `../../ROUTINE.md` for the running log of what each routine touched and what
to pick up next.
