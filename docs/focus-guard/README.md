# Focus Guard

> An epistemic-integrity guardrail for scientific discourse.

Focus Guard keeps a paper's reviews and comments tethered to its **central
claim**, surfaces **cognitive bias** and **rhetorical drift**, and responds with
a brief, **autonomy-supportive nudge**. It is a coach, not a bouncer: it never
blocks, hides, or deletes a contribution. The strongest move it can make is to
_invite_ a reframe.

It exists because the failure mode of open scientific discussion is rarely
malice — it's **drift**. Threads wander off the claim, bikeshed the typos,
attack the author instead of the argument, and reward confident assertion over
evidence. Focus Guard is a gentle attentional anchor against that entropy.

## The pipeline

```
deriveAnchor(paper)               → FocusAnchor   (the central claim + key terms)
evaluate(contribution, anchor)    → FocusReport   (drift, signals, a nudge)
aggregateHealth(reports)          → FocusHealth   (thread-level epistemic health)
```

## Packages

| Path                                         | What                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `lib/focus-guard`                            | The engine: deterministic, dependency-free core (zod only at the boundary), fully unit-tested. |
| `lib/db/src/schema/focusGuard.ts`            | Persistence: `focus_anchors`, `focus_signals`.                                                 |
| `artifacts/api-server/src/lib/focusGuard.ts` | The server adapter (DB ↔ engine). Not yet mounted on a route — see ROUTINE-CHECK.md.           |

## Quick start

```ts
import {
  deriveAnchor,
  evaluate,
  aggregateHealth,
} from "@workspace/focus-guard";

const anchor = deriveAnchor({
  title: "Sleep deprivation impairs hippocampal memory consolidation in rats",
  abstract: "We show that 24h of sleep deprivation reduces consolidation…",
  fields: ["neuroscience", "memory"],
});

const report = evaluate(
  {
    kind: "review",
    text: "This is garbage, the authors clearly can't do stats.",
    stance: "reject",
  },
  anchor,
);

report.verdict; // "on_focus" (it's on topic — but…)
report.interventionLevel; // "reframe"
report.nudge?.message; // an autonomy-supportive invitation to rephrase
```

## Design principles

1. **Never block.** Autonomy is preserved; we nudge, we don't gate. (Nudge
   theory / libertarian paternalism.)
2. **High precision over recall.** A false nudge trains users to ignore the
   system (alarm fatigue). When unsure, stay quiet.
3. **Separate topic, reasoning, and tone.** A hostile review can be perfectly
   on-topic; an off-topic comment can be perfectly polite. Each gets a different
   response.
4. **Deterministic core, optional model.** The lexical engine is reproducible
   and testable; an LLM can augment via `EvidenceOverrides` without changing any
   downstream shape.
5. **Self-describing.** Every pattern lives in one registry (`biases.ts`) with
   its psychological basis and citations, so the docs, detector, and nudges
   never drift apart.

See [`PSYCHOLOGY.md`](./PSYCHOLOGY.md) for the research grounding and
[`ROUTINE-CHECK.md`](./ROUTINE-CHECK.md) for the development log and the plan for
the next routine.

## Run it

```bash
pnpm --filter @workspace/focus-guard run test    # node:test, 15 cases
pnpm run typecheck                                 # whole workspace
```
