# Focus Guard — Design & Psychology Basis

> An attention-protection engine for deep scientific work, built into the
> Science Forum Hub. Focus Guard helps a researcher size a work block, defend
> it from interruptions, pace the day, and learn from each session — with every
> decision traceable to the psychology it rests on.

## Why this exists

The Hub is where scientists draft, review, and argue over papers. All of that
is *directed-attention* work — the most fatigable, most easily fragmented kind
of cognition there is. Focus Guard is the subsystem that treats a researcher's
attention as the scarce resource it actually is, and protects it on purpose
rather than by willpower.

The design rule throughout: **be a guardrail, not a cage.** Every nudge gives a
reason and leaves the final choice with the user (Self-Determination Theory).
Wellbeing always overrides focus — bodily needs and emergencies pass instantly.

## Architecture

Two packages, cleanly split between *brain* and *memory*:

```
lib/focus-guard/          # pure, deterministic engine — no I/O, no framework
  src/
    constants.ts          # the knowledge base: every number + its citation
    math.ts               # clamp / lerp / saturate / decay helpers
    types.ts              # the shared vocabulary
    flow.ts               # 8-channel flow model (challenge × skill)
    circadian.ts          # chronotype alertness curve + post-lunch dip
    ultradian.ts          # size a work block & its break
    attentionResidue.ts   # cost of recent task switches
    restoration.ts        # ART-based break prescription
    focusBudget.ts        # soft daily capacity (ego-depletion — caveated)
    intentions.ts         # implementation intentions (if-then plans)
    interruptionPolicy.ts # THE GUARD: allow / defer / shield
    score.ts              # peak-end weighted session quality
    streaks.ts            # habit strength with grace
    recommend.ts          # orchestrator: buildFocusPlan()
    index.ts              # public surface
    focus-guard.test.ts   # 28 tests, node:test

lib/db/src/schema/        # persistence (Drizzle + Postgres)
    focusProfiles.ts      # stable per-user traits (chronotype, sensitivity…)
    focusSessions.ts      # the unit of deep work, + peak-end score
    focusInterruptions.ts # guard verdict audit log / tuning data
    focusIntentions.ts    # if-then plans, optionally tied to a paper
    focusOpenLoops.ts     # the Zeigarnik parking lot
```

The engine is intentionally side-effect-free so it runs identically on client
and server and is trivially testable. The DB layer is the only stateful part.

## The psychology, module by module

Each engine module encodes one well-known finding. Full citations live in
`constants.ts` under `CITATIONS`; this is the readable tour.

| Module | Principle | Source | Confidence |
|---|---|---|---|
| `flow.ts` | Flow needs high, balanced challenge & skill; the plane has 8 channels | Csikszentmihalyi 1990; Massimini & Carli 1988 | high |
| `circadian.ts` | Alertness tracks chronotype; the "synchrony effect"; post-lunch dip | Horne & Östberg 1976; May & Hasher 1998; Monk 2005 | high / moderate |
| `ultradian.ts` | ~90-min Basic Rest-Activity Cycle bounds a block; timeboxing lowers start cost | Kleitman 1963; Cirillo 2006 | moderate |
| `attentionResidue.ts` | Switching before completion leaves performance-taxing residue | Leroy 2009 | high |
| `restoration.ts` | Directed attention restores best via "soft fascination" / nature | Kaplan & Kaplan 1989; Kaplan 1995 | high |
| `focusBudget.ts` | A depletable self-control resource — **CONTESTED** | Baumeister 1998; **Hagger 2016 (null); Friese 2019** | contested |
| `intentions.ts` | If-then plans ~double goal attainment | Gollwitzer 1999; Gollwitzer & Sheeran 2006 | high |
| `interruptionPolicy.ts` | Capture unfinished thoughts to release their pull (Zeigarnik); protect autonomy (SDT) | Zeigarnik 1927; Masicampo & Baumeister 2011; Deci & Ryan 2000 | moderate / high |
| `score.ts` | Memory of an episode = peak + end, duration neglected | Kahneman et al. 1993 | high |
| `streaks.ts` | Automaticity ≈ 66 days, one miss ≠ reset; counter the "what-the-hell effect" | Lally 2010; Polivy & Herman 1985 | moderate |
| `recommend.ts` | Inverted-U arousal/performance | Yerkes & Dodson 1908; Diamond 2007 | moderate |

### The honest caveat (focusBudget.ts)

The daily "budget" is the one model resting on a *contested* effect. Large
pre-registered replications (Hagger et al. 2016) and meta-analysis (Friese et
al. 2019) failed to find ego depletion at its originally reported size. So we
implement it as a **soft, self-reported resource heuristic** for humane pacing,
never a hard limit, and `assessBudget()` surfaces the caveat in *every* result.
This is deliberate: a credible science tool must not launder a shaky finding as
fact. As we gather per-user telemetry, the population priors give way to the
user's own data.

## The guard (the heart)

`evaluateInterruption(session, interruption)` returns `allow | defer | shield`:

1. **Wellbeing first** — emergencies and bodily needs always `allow`.
2. **Overrun** — past the planned block, be permissive (commitment honoured).
3. **Internal thoughts / switch-urges** — `shield` and **park to the open-loop
   list** (Zeigarnik release) instead of obeying them.
4. **Flow** — defended hardest; near-flow states are expensive to rebuild.
5. **Warmup** — shield low-value noise so engagement can form.
6. **External notifications** — `defer` (batch) to the break.
7. **People** — `defer` to the break so they get full attention, not half.

Every verdict carries an autonomy-supportive `message` (rationale + choice),
never shame or a hard block.

## Design principles

- **Traceable.** No magic numbers outside `constants.ts`; each binds to a cite.
- **Falsifiable & overridable.** Priors yield to user telemetry; contested
  findings are labelled.
- **Humane.** SDT framing; wellbeing > focus; lapses are recoverable.
- **Pure core.** The engine is deterministic and dependency-light (only `zod`).
