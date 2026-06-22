/**
 * ultradian.ts — size a work block and its break.
 *
 * Start from the Basic Rest-Activity Cycle (~90 min) and shrink it toward the
 * conditions in front of us: time of day (circadian alertness), accumulated
 * fatigue (sessions already done), the user's own completion history, and the
 * session mode. We never recommend longer than the user reliably completes —
 * a finished 40-minute block beats an abandoned 90.
 * @see CITATIONS.ULTRADIAN, CITATIONS.POMODORO
 */

import { alertnessAt } from "./circadian";
import { POMODORO, ULTRADIAN } from "./constants";
import { clamp, lerp, roundToStep } from "./math";
import type { FocusContext, SessionMode, SessionPlan } from "./types";

/** Per-mode base block before circadian/fatigue adjustment. */
const MODE_BASE_MINUTES: Record<SessionMode, number> = {
  deep: ULTRADIAN.CYCLE_MINUTES,
  review: 50,
  shallow: POMODORO.WORK_MINUTES,
  restorative: 15,
};

/** Break as a fraction of work time, per mode (deep work earns more rest). */
const MODE_BREAK_RATIO: Record<SessionMode, number> = {
  deep: 0.22,
  review: 0.2,
  shallow: 0.2,
  restorative: 0.5,
};

export function recommendSession(
  ctx: FocusContext,
  mode: SessionMode = "deep",
): SessionPlan {
  const rationale: string[] = [];
  let minutes = MODE_BASE_MINUTES[mode];

  // 1) Circadian alertness scales the block between 55% and 100% of base.
  const alertness = alertnessAt(ctx.localHour, ctx.chronotype);
  const circadianFactor = lerp(0.55, 1, alertness);
  minutes *= circadianFactor;
  if (alertness >= 0.75) {
    rationale.push(
      `It's your peak window (alertness ${alertness.toFixed(2)}) — a full block is well spent here.`,
    );
  } else if (alertness < 0.45) {
    rationale.push(
      `Alertness is low (${alertness.toFixed(2)}); the block is trimmed to match a shallower trough.`,
    );
  }

  // 2) Fatigue: each prior session today shaves ~12%, floored at 60%.
  const fatigueFactor = clamp(1 - 0.12 * ctx.consecutiveSessionsToday, 0.6, 1);
  minutes *= fatigueFactor;
  if (ctx.consecutiveSessionsToday >= 2) {
    rationale.push(
      `This is deep session #${ctx.consecutiveSessionsToday + 1} today; shortened to respect accumulating fatigue.`,
    );
  }

  // 3) Completion history: if the user rarely finishes long blocks, pull the
  //    recommendation toward what they actually complete (a finished block is
  //    the unit of progress, not the planned one).
  const completion = ctx.historicalCompletionRate;
  if (typeof completion === "number" && completion < 0.7) {
    const pull = lerp(0.6, 1, clamp(completion / 0.7, 0, 1));
    minutes *= pull;
    rationale.push(
      `You complete ~${Math.round(completion * 100)}% of long blocks, so this one is right-sized to be finishable.`,
    );
  }

  // 4) Clamp to sane bounds and round to a friendly 5-minute step.
  const lower = mode === "deep" ? ULTRADIAN.MIN_BLOCK_MINUTES : 10;
  const workMinutes = roundToStep(
    clamp(minutes, lower, ULTRADIAN.MAX_BLOCK_MINUTES),
    5,
  );

  const breakMinutes = Math.max(
    POMODORO.SHORT_BREAK_MINUTES,
    roundToStep(workMinutes * MODE_BREAK_RATIO[mode], 5),
  );

  if (rationale.length === 0) {
    rationale.push(
      `Standard ${mode} block anchored to the ~90-minute ultradian cycle.`,
    );
  }

  return { mode, workMinutes, breakMinutes, rationale };
}
