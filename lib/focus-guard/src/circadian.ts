/**
 * circadian.ts — model a person's alertness across the day.
 *
 * We combine a chronotype-shifted cosine "process C" with a fixed early-
 * afternoon post-lunch dip. The output is a 0..1 alertness estimate used to
 * size sessions and to warn when someone is working against their own grain
 * (the synchrony effect). @see CITATIONS.CHRONOTYPE, CITATIONS.POST_LUNCH_DIP
 */

import { clamp01, round } from "./math";
import type { Chronotype } from "./types";

/** Hour of peak alertness per chronotype (synchrony effect). */
const PEAK_HOUR: Record<Chronotype, number> = {
  lark: 10,
  intermediate: 12.5,
  owl: 17,
};

/** Hour of the circadian trough (roughly 12h from peak, clamped to night). */
const TROUGH_HOUR: Record<Chronotype, number> = {
  lark: 3,
  intermediate: 4,
  owl: 5,
};

const POST_LUNCH_CENTER = 14;
const POST_LUNCH_WIDTH = 1.6; // hours (std-dev of the dip gaussian)
const POST_LUNCH_DEPTH = 0.18; // alertness subtracted at the bottom of the dip

/** Smallest angular distance between two hours on a 24h clock, in hours. */
function hourDistance(a: number, b: number): number {
  const d = Math.abs(((a - b + 12 + 24) % 24) - 12);
  return d;
}

/**
 * Alertness in [0,1] at `localHour` for a given chronotype.
 * Peaks at PEAK_HOUR, bottoms near TROUGH_HOUR, with a subtracted afternoon dip.
 */
export function alertnessAt(localHour: number, chronotype: Chronotype): number {
  const peak = PEAK_HOUR[chronotype];
  const trough = TROUGH_HOUR[chronotype];

  // Cosine process: 1 at peak, 0 at trough. Use distance from peak over the
  // peak->trough span (~12h) to drive a half-cosine.
  const distFromPeak = hourDistance(localHour, peak);
  const peakTroughSpan = Math.max(1, hourDistance(peak, trough));
  const phase = clamp01(distFromPeak / peakTroughSpan); // 0 at peak, 1 at trough
  const base = (Math.cos(phase * Math.PI) + 1) / 2; // 1 -> 0

  // Post-lunch dip: gaussian centred at 14:00.
  const dipDist = hourDistance(localHour, POST_LUNCH_CENTER);
  const dip = POST_LUNCH_DEPTH * Math.exp(-(dipDist * dipDist) / (2 * POST_LUNCH_WIDTH ** 2));

  return round(clamp01(base - dip), 3);
}

/**
 * Is `localHour` within (or near) the person's high-alertness window?
 * Used to flag synchrony: deep work scheduled at one's peak performs better.
 */
export function isPeakWindow(localHour: number, chronotype: Chronotype): boolean {
  return alertnessAt(localHour, chronotype) >= 0.75;
}

/** Human-readable label for the current circadian moment. */
export function circadianLabel(localHour: number, chronotype: Chronotype): string {
  const a = alertnessAt(localHour, chronotype);
  if (hourDistance(localHour, POST_LUNCH_CENTER) < 1.2 && a < 0.8) {
    return "post-lunch dip";
  }
  if (a >= 0.8) return "peak window";
  if (a >= 0.55) return "moderate alertness";
  if (a >= 0.3) return "low alertness";
  return "circadian trough";
}
