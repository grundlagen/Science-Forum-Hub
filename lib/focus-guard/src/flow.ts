/**
 * flow.ts — locate a (challenge, skill) self-report on the flow plane.
 *
 * We implement the eight-channel Experience Fluctuation Model: challenge and
 * skill are each bucketed (low / medium / high) relative to the person's mean,
 * and the pair maps to one of eight experiential channels. Flow lives where
 * both are high and balanced. @see CITATIONS.FLOW
 */

import { FLOW } from "./constants";
import { clamp, clamp01, round } from "./math";
import type { FlowAssessment, FlowChannel } from "./types";

type Band = "low" | "medium" | "high";

function bandOf(value: number, mean: number): Band {
  const span = FLOW.SCALE_MAX - FLOW.SCALE_MIN;
  const half = span * FLOW.MEDIUM_BAND_FRACTION;
  if (value > mean + half) return "high";
  if (value < mean - half) return "low";
  return "medium";
}

/**
 * Canonical 8-channel mapping (Massimini & Carli, 1988). The medium/medium
 * centre is the neutral origin; we resolve it to "control" if skill leads,
 * otherwise "arousal", but in practice proximity (below) carries the nuance.
 */
const CHANNEL_TABLE: Record<Band, Record<Band, FlowChannel>> = {
  // [challenge][skill]
  high: { low: "anxiety", medium: "arousal", high: "flow" },
  medium: { low: "worry", medium: "arousal", high: "control" },
  low: { low: "apathy", medium: "boredom", high: "relaxation" },
};

const GUIDANCE: Record<FlowChannel, string> = {
  flow: "You're in the flow channel — protect this block fiercely and don't reopen anything.",
  arousal:
    "High challenge, growing skill: you're learning. Stretch slightly and the channel tips into flow.",
  control:
    "Comfortable mastery. Raise the challenge (a harder sub-problem) to move toward flow.",
  relaxation:
    "Easy and pleasant but under-stretched. Fine for recovery work; pick something harder for deep work.",
  boredom: "Under-challenged. Add constraints or a deadline to re-engage.",
  apathy:
    "Low challenge and low skill — disengaged. Switch tasks or shrink scope to something concrete.",
  worry:
    "Moderate challenge outpacing skill. Break the task down and lower the stakes before continuing.",
  anxiety:
    "Challenge far exceeds current skill. Scaffold it: smaller steps, an example, or a collaborator.",
};

/**
 * Continuous proximity to flow in [0,1]. Flow is favoured when both inputs
 * sit above the mean (elevation) and are close to each other (balance).
 */
export function flowProximity(
  challenge: number,
  skill: number,
  mean: number = FLOW.DEFAULT_MEAN,
): number {
  const c = clamp(challenge, FLOW.SCALE_MIN, FLOW.SCALE_MAX);
  const s = clamp(skill, FLOW.SCALE_MIN, FLOW.SCALE_MAX);
  const span = FLOW.SCALE_MAX - FLOW.SCALE_MIN;

  // Elevation: how far above the personal mean the pair sits (0 at/below mean).
  const headroom = FLOW.SCALE_MAX - mean;
  const elevation =
    headroom <= 0 ? 1 : clamp01(((c + s) / 2 - mean) / headroom);

  // Balance: 1 when challenge == skill, decaying as they diverge.
  const imbalance = Math.abs(c - s);
  const balance = clamp01(1 - imbalance / span);

  // Flow needs both; weight elevation a touch higher than balance.
  return clamp01(0.6 * elevation + 0.4 * balance) * (elevation > 0 ? 1 : 0);
}

export function assessFlow(
  challenge: number,
  skill: number,
  mean: number = FLOW.DEFAULT_MEAN,
): FlowAssessment {
  const cBand = bandOf(challenge, mean);
  const sBand = bandOf(skill, mean);
  const channel = CHANNEL_TABLE[cBand][sBand];
  const proximity = flowProximity(challenge, skill, mean);

  // "In flow" = explicitly the flow channel, or close enough that an
  // interruption would still be costly to a near-flow state.
  const inFlow = channel === "flow" || proximity >= 0.7;

  return {
    channel,
    proximity: round(proximity),
    inFlow,
    guidance: GUIDANCE[channel],
  };
}
