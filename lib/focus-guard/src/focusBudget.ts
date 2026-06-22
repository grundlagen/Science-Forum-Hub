/**
 * focusBudget.ts — a soft daily "deep work" budget.
 *
 * This models a depletable capacity for self-control / directed attention.
 * The honest caveat (which we surface to the user every time): the classic
 * ego-depletion effect is CONTESTED — large pre-registered replications found
 * it null or small. So we treat this as a *self-reported resource* heuristic
 * for humane pacing, never as a hard limit, and it is always overridable.
 * @see CITATIONS.EGO_DEPLETION
 *
 * The budget is built from:
 *   - sleep (sets the day's starting capacity),
 *   - intensity-weighted deep minutes already spent (depletes),
 *   - restorative minutes taken (partially recovers, capped).
 */

import { FOCUS_BUDGET } from "./constants";
import { clamp, clamp01, lerp, round } from "./math";
import type { BudgetAssessment, FocusContext } from "./types";

const CAVEAT =
  "Heuristic only: the ego-depletion effect this is based on is contested " +
  "(Hagger 2016; Friese 2019). Treat it as gentle pacing advice, not a limit — " +
  "you know your own state best.";

/** Starting capacity (minutes) for the day, scaled by sleep. */
function capacityFromSleep(sleepHours: number): number {
  const lo = FOCUS_BUDGET.MIN_FUNCTIONAL_SLEEP_HOURS;
  const hi = FOCUS_BUDGET.FULL_REST_SLEEP_HOURS;
  // Below lo => 50% capacity; at/above hi => 100%; linear between.
  const t = clamp((sleepHours - lo) / (hi - lo), 0, 1);
  const factor = lerp(0.5, 1, t);
  return FOCUS_BUDGET.BASELINE_CAPACITY_MINUTES * factor;
}

export function assessBudget(ctx: FocusContext): BudgetAssessment {
  const rationale: string[] = [];
  const capacity = capacityFromSleep(ctx.sleepHours);

  if (ctx.sleepHours < FOCUS_BUDGET.MIN_FUNCTIONAL_SLEEP_HOURS) {
    rationale.push(
      `Only ${ctx.sleepHours}h sleep — starting capacity is reduced; favour review/shallow work over novel deep work.`,
    );
  } else if (ctx.sleepHours >= FOCUS_BUDGET.FULL_REST_SLEEP_HOURS) {
    rationale.push(`Well-rested (${ctx.sleepHours}h) — full capacity to start the day.`);
  }

  // Restoration buys back capacity, capped so a day of breaks can't fully reset.
  const recoveredRaw =
    ctx.restorationMinutesToday / FOCUS_BUDGET.RESTORATION_EXCHANGE_RATE;
  const recoveryCap = capacity * FOCUS_BUDGET.MAX_RESTORATION_RECOVERY;
  const recovered = Math.min(recoveredRaw, recoveryCap);
  if (recovered > 5) {
    rationale.push(
      `Today's ${ctx.restorationMinutesToday} restorative minutes bought back ~${Math.round(recovered)} minutes of capacity.`,
    );
  }

  const spent = ctx.priorDeepMinutesToday;
  const effectiveCapacity = capacity + recovered;
  const remaining = clamp01(1 - spent / effectiveCapacity);
  const recommendedDeepMinutes = Math.max(0, Math.round(effectiveCapacity - spent));

  if (remaining < 0.2) {
    rationale.push(
      `You've spent most of today's deep-work budget (${spent} min). Consider wrapping up or switching to restorative work.`,
    );
  } else if (remaining > 0.8) {
    rationale.push(`Plenty of budget left (${recommendedDeepMinutes} deep minutes suggested).`);
  }

  return {
    remaining: round(remaining),
    recommendedDeepMinutes,
    caveat: CAVEAT,
    rationale,
  };
}
