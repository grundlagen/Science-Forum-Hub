/**
 * attentionResidue.ts — estimate the lingering pull of recently-left tasks.
 *
 * Leroy (2009): switching away from a task before it's done leaves "attention
 * residue" that taxes the next task. Residue is worse for unfinished tasks and
 * under time pressure, and it decays over time once you settle into new work.
 * We model each recent switch as a decaying contribution and saturate the sum
 * into a 0..1 residue score. @see CITATIONS.ATTENTION_RESIDUE
 */

import { RESIDUE } from "./constants";
import { clamp01, decay, round, saturate } from "./math";
import type { ResidueAssessment, TaskSwitch } from "./types";

/** Weighted, time-decayed contribution of a single switch. */
function switchContribution(s: TaskSwitch): number {
  const base = s.completed
    ? RESIDUE.WEIGHT_COMPLETE
    : RESIDUE.WEIGHT_INCOMPLETE;
  const pressure = s.underTimePressure ? RESIDUE.TIME_PRESSURE_MULTIPLIER : 1;
  return base * pressure * decay(s.minutesAgo, RESIDUE.DECAY_MINUTES);
}

export function assessResidue(
  switches: readonly TaskSwitch[] = [],
): ResidueAssessment {
  let total = 0;
  for (const s of switches) total += switchContribution(s);

  const residue = saturate(total, RESIDUE.SATURATION_SCALE);

  // Readiness is the complement, but we shape it so that small residue barely
  // hurts while high residue bites — clearing rituals matter most when it's bad.
  const readiness = clamp01(1 - residue * residue);

  // Suggest a proportional "clearing" ritual: brain-dump open loops, then a
  // brief settle. Caps at ~8 minutes so it never eats the session.
  const suggestedClearingMinutes = Math.round(residue * 8);

  let note: string;
  if (residue < 0.2) {
    note = "Clean slate — minimal residue from prior tasks. Dive straight in.";
  } else if (residue < 0.5) {
    note =
      "Some residue lingers. A quick brain-dump of open loops will sharpen the start.";
  } else {
    note =
      "Heavy residue from unfinished switches. Park every open loop in writing before deep work, or you'll keep half-thinking about them.";
  }

  return {
    residue: round(residue),
    readiness: round(readiness),
    suggestedClearingMinutes,
    note,
  };
}
