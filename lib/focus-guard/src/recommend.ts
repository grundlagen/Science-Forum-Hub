/**
 * recommend.ts — the orchestrator.
 *
 * buildFocusPlan() is the one call a UI usually needs: it folds together the
 * flow, circadian/ultradian, residue, budget and restoration sub-models into a
 * single, ready-to-act FocusPlan, framed in autonomy-supportive language.
 * @see CITATIONS.SELF_DETERMINATION, CITATIONS.YERKES_DODSON
 */

import { assessResidue } from "./attentionResidue";
import { alertnessAt, circadianLabel, isPeakWindow } from "./circadian";
import { AROUSAL } from "./constants";
import { assessBudget } from "./focusBudget";
import { assessFlow } from "./flow";
import { clamp, clamp01, round } from "./math";
import { recommendBreak } from "./restoration";
import { recommendSession } from "./ultradian";
import type { FocusContext, FocusPlan, SessionMode } from "./types";

/** Yerkes-Dodson: how optimal is current arousal for hard cognitive work? 0..1. */
function arousalOptimality(arousal: number): number {
  const a = clamp(arousal, AROUSAL.SCALE_MIN, AROUSAL.SCALE_MAX);
  if (a >= AROUSAL.OPTIMAL_LOW && a <= AROUSAL.OPTIMAL_HIGH) return 1;
  const dist =
    a < AROUSAL.OPTIMAL_LOW
      ? AROUSAL.OPTIMAL_LOW - a
      : a - AROUSAL.OPTIMAL_HIGH;
  return clamp01(1 - dist / 4);
}

export function buildFocusPlan(
  ctx: FocusContext,
  mode: SessionMode = "deep",
): FocusPlan {
  const flow = assessFlow(ctx.challenge, ctx.skill);
  const residue = assessResidue(ctx.recentSwitches);
  const budget = assessBudget(ctx);
  const session = recommendSession(ctx, mode);
  const alertness = alertnessAt(ctx.localHour, ctx.chronotype);
  const arousalFit = arousalOptimality(ctx.arousal);

  // Depletion drives the *predicted* post-session break: how spent we expect to
  // be combines today's budget burn with accumulated fatigue.
  const depletion = clamp01(
    0.6 * (1 - budget.remaining) + 0.25 * clamp01(ctx.consecutiveSessionsToday / 4) + 0.15 * (1 - alertness),
  );
  const predictedBreak = recommendBreak(depletion, ctx.outdoorsAvailable);

  // Overall readiness: a weighted blend of the things that must be true to
  // start a *good* deep block right now.
  const readiness = round(
    clamp01(
      0.3 * residue.readiness +
        0.25 * budget.remaining +
        0.25 * alertness +
        0.2 * arousalFit,
    ),
  );

  const warnings: string[] = [];
  if (!isPeakWindow(ctx.localHour, ctx.chronotype) && mode === "deep") {
    warnings.push(
      `It's your ${circadianLabel(ctx.localHour, ctx.chronotype)}, not your peak — deep work is doable but will cost more. If you can, save novel work for your peak window.`,
    );
  }
  if (arousalFit < 0.6) {
    warnings.push(
      ctx.arousal < AROUSAL.OPTIMAL_LOW
        ? "Arousal is low — a short walk or a clear, slightly-harder first step will lift you into the productive zone (Yerkes-Dodson)."
        : "Arousal is high — a couple of slow breaths first; over-arousal hurts complex work as much as under-arousal does.",
    );
  }
  if (budget.remaining < 0.2) warnings.push(budget.rationale[budget.rationale.length - 1] ?? budget.caveat);
  if (flow.channel === "anxiety" || flow.channel === "worry") {
    warnings.push("Challenge is outrunning skill — scaffold the task smaller before you start, or this block will spike anxiety, not focus.");
  }

  // Pre-session ritual, ordered. Concrete > motivational.
  const startRitual: string[] = [];
  if (residue.suggestedClearingMinutes > 0) {
    startRitual.push(
      `Brain-dump open loops (~${residue.suggestedClearingMinutes} min): write down everything tugging at you so it stops looping.`,
    );
  }
  startRitual.push("Silence and stash the phone; close every tab that isn't this task.");
  startRitual.push(
    flow.channel === "boredom" || flow.channel === "relaxation"
      ? "Pick a slightly harder slice of the work to climb toward flow."
      : flow.channel === "anxiety" || flow.channel === "worry"
        ? "Shrink the task to one concrete next step you're sure you can do."
        : "Name the single concrete output for this block before the timer starts.",
  );
  startRitual.push(`Set a timer for ${session.workMinutes} minutes and define 'done' for this block.`);

  // SDT-framed motivation: autonomy (you chose), competence (right-sized), and
  // a felt reason — never coercive.
  const motivation = buildMotivation(readiness, flow.inFlow, session.workMinutes);

  return {
    session,
    flow,
    residue,
    budget,
    predictedBreak,
    readiness,
    startRitual,
    motivation,
    warnings,
  };
}

function buildMotivation(
  readiness: number,
  inFlow: boolean,
  workMinutes: number,
): string {
  if (inFlow) {
    return "You're set up for flow — this is the good stuff. You chose this work; now give it an uninterrupted run and let it carry you.";
  }
  if (readiness >= 0.7) {
    return `Conditions are good (readiness ${Math.round(readiness * 100)}%). A clean ${workMinutes}-minute block now is worth more than a fragmented hour later — your call, but the door's open.`;
  }
  if (readiness >= 0.45) {
    return `Readiness is moderate (${Math.round(readiness * 100)}%). You don't need perfect conditions — a right-sized block builds competence regardless. Start small; momentum does the rest.`;
  }
  return `Readiness is low (${Math.round(readiness * 100)}%) and that's useful information, not a verdict. A short, gentle block — or an honest break — both count. Choose the one you can actually commit to.`;
}
