/**
 * Circadian load — how much the time of day works against clear judgment.
 *
 * Returns 0..1, where higher means a worse window for careful review. Two
 * features are modelled: the early-afternoon post-lunch dip and the deep
 * nocturnal trough. Chronotype shifts both earlier (larks) or later (owls).
 */
import {
  CHRONOTYPE_SHIFT_HOURS,
  NOCTURNAL,
  POST_LUNCH_DIP,
} from "../constants";
import type { Chronotype } from "../types";
import { bump, clamp } from "./math";

/**
 * Nocturnal trough as a function of fractional hour. Alertness collapses
 * overnight; we ramp load up from `start`, carry it across midnight, and ease
 * it off after the pre-dawn `peak`.
 */
function nocturnalLoad(hour: number): number {
  const { start, peak, depth } = NOCTURNAL;
  // Distance, in hours, from now to the trough's peak, wrapping at 24h.
  const raw = Math.abs(hour - peak);
  const dist = Math.min(raw, 24 - raw);
  // Width of the trough either side of the peak (peak -> start going backwards).
  const halfWidth = (24 - start + peak) / 2 + 1;
  return clamp(depth * Math.exp(-((dist / halfWidth) ** 2)));
}

/**
 * Circadian load for a given local hour and chronotype.
 * @param hour fractional local hour in [0, 24)
 */
export function circadianLoad(hour: number, chronotype: Chronotype = "neutral"): number {
  const shift = CHRONOTYPE_SHIFT_HOURS[chronotype];
  // Shift the *clock the body keeps* relative to the wall clock.
  const bodyHour = (((hour - shift) % 24) + 24) % 24;
  const lunch = bump(bodyHour, POST_LUNCH_DIP.center, POST_LUNCH_DIP.halfWidth, POST_LUNCH_DIP.depth);
  const night = nocturnalLoad(bodyHour);
  // Two independent troughs; take the stronger rather than summing past 1.
  return clamp(Math.max(lunch, night) + 0.25 * Math.min(lunch, night));
}
