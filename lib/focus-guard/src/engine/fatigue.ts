/**
 * Fatigue Guard — decision fatigue & ego depletion.
 *
 * Combines three contributors into a single 0..1 fatigue score:
 *   • time      — continuous focus since the last break (ultradian load)
 *   • quantity  — independent verdicts already committed this session
 *   • circadian — the time-of-day penalty
 *
 * Breaks both reset the time contributor and "forgive" some quantity load,
 * mirroring the recovery seen after rest in the hungry-judges data
 * (Danziger et al. 2011).
 */
import {
  DECISION_TAU,
  FATIGUE_BANDS,
  FATIGUE_WEIGHT_CIRCADIAN,
  FATIGUE_WEIGHT_QUANTITY,
  FATIGUE_WEIGHT_TIME,
  REVIEWS_RECOVERED_PER_BREAK,
  TIME_FATIGUE_TAU_MS,
  ULTRADIAN_MS,
  VERDICT_TRUST_FLOOR,
} from "../constants";
import type { FatigueAssessment, FatigueBand, FocusSession } from "../types";
import { circadianLoad } from "./circadian";
import { clamp, round, saturate } from "./math";

/** Continuous focus time since the last break (or session start). */
export function continuousFocusMs(session: FocusSession, now: number): number {
  const anchor = session.lastBreakEndedAt ?? session.startedAt;
  return Math.max(0, now - anchor);
}

function bandFor(score: number): FatigueBand {
  if (score < FATIGUE_BANDS.fresh) return "fresh";
  if (score < FATIGUE_BANDS.steady) return "steady";
  if (score < FATIGUE_BANDS.tiring) return "tiring";
  return "depleted";
}

export function assessFatigue(
  session: FocusSession,
  now: number,
  opts: { localHour?: number; chronotype?: "early" | "neutral" | "late" } = {},
): FatigueAssessment {
  const time = saturate(continuousFocusMs(session, now), TIME_FATIGUE_TAU_MS);

  // Decision load grows with reviews done but is partly repaid by breaks taken.
  const effectiveReviews = Math.max(
    0,
    session.reviewsCompleted - session.breaksTaken * REVIEWS_RECOVERED_PER_BREAK,
  );
  const quantity = saturate(effectiveReviews, DECISION_TAU);

  const circadian =
    opts.localHour === undefined ? 0 : circadianLoad(opts.localHour, opts.chronotype ?? "neutral");

  // Weighted blend. When circadian is skipped, renormalise over the other two
  // so the score still spans 0..1.
  const wTime = FATIGUE_WEIGHT_TIME;
  const wQty = FATIGUE_WEIGHT_QUANTITY;
  const wCirc = opts.localHour === undefined ? 0 : FATIGUE_WEIGHT_CIRCADIAN;
  const wSum = wTime + wQty + wCirc;
  const score = clamp((wTime * time + wQty * quantity + wCirc * circadian) / wSum);

  const verdictTrust = clamp(1 - (1 - VERDICT_TRUST_FLOOR) * score, VERDICT_TRUST_FLOOR, 1);
  const recommendBreak =
    score >= FATIGUE_BANDS.tiring || continuousFocusMs(session, now) >= ULTRADIAN_MS;

  return {
    score: round(score),
    band: bandFor(score),
    verdictTrust: round(verdictTrust),
    recommendBreak,
    contributors: {
      time: round(time),
      quantity: round(quantity),
      circadian: round(circadian),
    },
  };
}
