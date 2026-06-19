/**
 * The debrief.
 *
 * A session ends with a short, specific, non-judgemental reflection. Specific
 * competence feedback ("you held 48 of 50 minutes") informs without controlling;
 * generic praise ("great job!") and shame ("you failed") both undermine the
 * intrinsic motivation we want to protect (Deci, Koestner & Ryan 1999). We also
 * surface exactly one concrete lever for next time — never a pile of critique —
 * because one actionable next step is what actually changes behaviour.
 */

import type { FocusScoreResult } from "./scoring";
import type { IntentionOutcome } from "./types";

export interface ReflectionInput {
  intention: string;
  intentionOutcome: IntentionOutcome;
  plannedMinutes: number;
  focusedMinutes: number;
  distractionCount: number;
  parkedThoughts: number;
  score: FocusScoreResult;
}

export interface Reflection {
  /** The headline, tuned to the tier. */
  headline: string;
  /** Two or three specific, factual observations. */
  observations: string[];
  /** Exactly one concrete lever to try next time. */
  nextLever: string;
}

const HEADLINES: Record<FocusScoreResult["tier"], string> = {
  exemplary: "That was deep work.",
  strong: "A strong, protected block.",
  solid: "Solid focus — the habit is holding.",
  developing: "A real attempt — the reps are what count.",
  scattered: "Choppy block. That happens; the next start is the win.",
};

export function buildReflection(input: ReflectionInput): Reflection {
  const observations: string[] = [];

  observations.push(
    `You held ${input.focusedMinutes} of ${input.plannedMinutes} planned minutes (${input.score.components.adherence}% adherence).`,
  );

  if (input.distractionCount === 0 && input.parkedThoughts === 0) {
    observations.push("No distractions logged — that's a clean signal of depth.");
  } else {
    const bits: string[] = [];
    if (input.distractionCount > 0)
      bits.push(`${input.distractionCount} distraction${input.distractionCount === 1 ? "" : "s"}`);
    if (input.parkedThoughts > 0)
      bits.push(
        `${input.parkedThoughts} thought${input.parkedThoughts === 1 ? "" : "s"} parked (well managed)`,
      );
    observations.push(`Attention: ${bits.join(", ")}.`);
  }

  switch (input.intentionOutcome) {
    case "completed":
      observations.push(`You finished what you set out to do: "${truncate(input.intention)}".`);
      break;
    case "partial":
      observations.push(`Partial progress on "${truncate(input.intention)}" — name the leftover as your next intention.`);
      break;
    case "not_met":
      observations.push(`The intention "${truncate(input.intention)}" went unmet — worth asking whether it was too big for one block.`);
      break;
    case "unset":
      observations.push("No intention was set for this block.");
      break;
    default:
      break;
  }

  // Pick the single most useful lever based on the weakest component.
  const c = input.score.components;
  let nextLever: string;
  if (input.intentionOutcome === "unset") {
    nextLever = "Next time, write one concrete intention before you start — it's the biggest lever there is.";
  } else if (c.depth <= c.adherence && c.depth <= c.followThrough) {
    nextLever =
      input.distractionCount > input.parkedThoughts
        ? "Next time, park intrusive thoughts in a note instead of chasing them — it closes the loop without the switch cost."
        : "Next time, try a shorter block or remove one source of interruption before starting.";
  } else if (c.adherence <= c.followThrough) {
    nextLever = "Next time, plan a block you can fully protect — a shorter block you finish beats a long one you abandon.";
  } else {
    nextLever = "Next time, size the intention to the block so 'done' is reachable inside the time.";
  }

  return {
    headline: HEADLINES[input.score.tier],
    observations,
    nextLever,
  };
}

function truncate(s: string, max = 80): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}
