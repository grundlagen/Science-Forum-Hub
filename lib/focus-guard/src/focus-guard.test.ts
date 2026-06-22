import assert from "node:assert/strict";
import { test } from "node:test";

import { assessResidue } from "./attentionResidue";
import { alertnessAt, isPeakWindow } from "./circadian";
import { assessBudget } from "./focusBudget";
import { assessFlow, flowProximity } from "./flow";
import { formatIntention, validateIntention } from "./intentions";
import {
  evaluateInterruption,
  sessionPhase,
  type SessionState,
} from "./interruptionPolicy";
import { buildFocusPlan } from "./recommend";
import { recommendBreak } from "./restoration";
import { scoreSession } from "./score";
import { assessStreak } from "./streaks";
import { recommendSession } from "./ultradian";
import type { FocusContext } from "./types";

const baseCtx: FocusContext = {
  chronotype: "lark",
  localHour: 10,
  challenge: 7,
  skill: 7,
  arousal: 5,
  sleepHours: 8,
  consecutiveSessionsToday: 0,
  priorDeepMinutesToday: 0,
  restorationMinutesToday: 0,
};

// ---- flow ------------------------------------------------------------------

test("flow: high+balanced challenge/skill yields the flow channel", () => {
  const a = assessFlow(9, 9);
  assert.equal(a.channel, "flow");
  assert.equal(a.inFlow, true);
  assert.ok(a.proximity > 0.8);
});

test("flow: high challenge + low skill yields anxiety", () => {
  assert.equal(assessFlow(9, 2).channel, "anxiety");
});

test("flow: low challenge + high skill yields relaxation", () => {
  assert.equal(assessFlow(2, 9).channel, "relaxation");
});

test("flow: proximity rewards elevation and balance", () => {
  assert.ok(flowProximity(9, 9) > flowProximity(9, 4));
  assert.equal(flowProximity(2, 2), 0); // below mean => no flow
});

// ---- circadian -------------------------------------------------------------

test("circadian: lark is sharper in the morning, owl in the evening", () => {
  assert.ok(alertnessAt(10, "lark") > alertnessAt(10, "owl"));
  assert.ok(alertnessAt(17, "owl") > alertnessAt(17, "lark"));
});

test("circadian: post-lunch dip reduces early-afternoon alertness", () => {
  // 14:00 should be below the lark's late-morning peak.
  assert.ok(alertnessAt(14, "lark") < alertnessAt(10, "lark"));
});

test("circadian: peak window detection", () => {
  assert.equal(isPeakWindow(10, "lark"), true);
  assert.equal(isPeakWindow(3, "lark"), false);
});

// ---- ultradian -------------------------------------------------------------

test("ultradian: deep block never exceeds the hard ceiling", () => {
  const plan = recommendSession({ ...baseCtx }, "deep");
  assert.ok(plan.workMinutes <= 110);
  assert.ok(plan.workMinutes >= 25);
  assert.ok(plan.breakMinutes >= 5);
});

test("ultradian: fatigue and low completion shrink the block", () => {
  const fresh = recommendSession(baseCtx, "deep").workMinutes;
  const tired = recommendSession(
    { ...baseCtx, consecutiveSessionsToday: 4, historicalCompletionRate: 0.4 },
    "deep",
  ).workMinutes;
  assert.ok(tired < fresh);
});

// ---- attention residue -----------------------------------------------------

test("residue: unfinished + recent switches raise residue", () => {
  const clean = assessResidue([]);
  const messy = assessResidue([
    { minutesAgo: 1, completed: false, underTimePressure: true },
    { minutesAgo: 2, completed: false },
  ]);
  assert.ok(messy.residue > clean.residue);
  assert.ok(messy.readiness < clean.readiness);
  assert.ok(messy.suggestedClearingMinutes > 0);
});

test("residue: a completed long-ago switch barely registers", () => {
  const r = assessResidue([{ minutesAgo: 60, completed: true }]);
  assert.ok(r.residue < 0.1);
});

// ---- restoration -----------------------------------------------------------

test("restoration: scales with depletion and prefers nature when outdoors", () => {
  assert.equal(recommendBreak(0.05).type, "none");
  assert.equal(recommendBreak(0.3, true).type, "nature");
  assert.ok(recommendBreak(0.9).minutes >= recommendBreak(0.3).minutes);
});

// ---- budget ----------------------------------------------------------------

test("budget: low sleep reduces remaining capacity", () => {
  const rested = assessBudget({ ...baseCtx, sleepHours: 8, priorDeepMinutesToday: 120 });
  const tired = assessBudget({ ...baseCtx, sleepHours: 4, priorDeepMinutesToday: 120 });
  assert.ok(tired.remaining < rested.remaining);
  assert.ok(tired.recommendedDeepMinutes < rested.recommendedDeepMinutes);
});

test("budget: always carries the contested-effect caveat", () => {
  assert.match(assessBudget(baseCtx).caveat, /contested/i);
});

// ---- intentions ------------------------------------------------------------

test("intentions: well-formed if-then plan validates and formats", () => {
  const v = validateIntention({ cueType: "time", cue: "09:00", action: "draft the methods section" });
  assert.equal(v.wellFormed, true);
  assert.ok(v.strength > 0.4);
  assert.equal(
    formatIntention({ cueType: "time", cue: "09:00", action: "draft the methods section" }),
    "If it's at 09:00, then I will draft the methods section.",
  );
});

test("intentions: vague plan is flagged", () => {
  const v = validateIntention({ cueType: "time", cue: "", action: "x" });
  assert.equal(v.wellFormed, false);
  assert.ok(v.issues.length >= 2);
});

// ---- the guard -------------------------------------------------------------

const deepSession: SessionState = { elapsedMinutes: 30, plannedMinutes: 90, inFlow: false };

test("guard: phase classification", () => {
  assert.equal(sessionPhase(2, 90), "warmup");
  assert.equal(sessionPhase(45, 90), "deep");
  assert.equal(sessionPhase(80, 90), "wind_down");
  assert.equal(sessionPhase(120, 90), "overrun");
});

test("guard: emergencies and bodily needs always pass", () => {
  assert.equal(
    evaluateInterruption(deepSession, { source: "external", kind: "person", urgency: "emergency" }).decision,
    "allow",
  );
  assert.equal(
    evaluateInterruption(deepSession, { source: "internal", kind: "physical", urgency: "routine" }).decision,
    "allow",
  );
});

test("guard: internal thoughts are captured, not obeyed (Zeigarnik)", () => {
  const v = evaluateInterruption(deepSession, {
    source: "internal",
    kind: "thought",
    urgency: "routine",
    note: "email the co-author",
  });
  assert.equal(v.decision, "shield");
  assert.equal(v.parkThought, true);
  assert.match(v.message, /open-loop/i);
});

test("guard: flow is defended hard", () => {
  const flowSession: SessionState = { ...deepSession, inFlow: true };
  const v = evaluateInterruption(flowSession, { source: "external", kind: "notification", urgency: "routine" });
  assert.equal(v.decision, "shield");
});

test("guard: notifications get batched to the break", () => {
  const v = evaluateInterruption(deepSession, { source: "external", kind: "notification", urgency: "routine" });
  assert.equal(v.decision, "defer");
});

test("guard: once overrun, be permissive", () => {
  const over: SessionState = { elapsedMinutes: 100, plannedMinutes: 90, inFlow: false };
  assert.equal(
    evaluateInterruption(over, { source: "external", kind: "person", urgency: "routine" }).decision,
    "allow",
  );
});

// ---- scoring ---------------------------------------------------------------

test("score: peak-end weighting beats a flat average", () => {
  // Same mean, but a strong peak and ending should score higher than a flat run.
  const peaky = scoreSession({
    peakIntensity: 10,
    endSatisfaction: 9,
    meanIntensity: 5,
    completion: 1,
    interruptionsHonored: 0,
    interruptionsShielded: 0,
  });
  const flat = scoreSession({
    peakIntensity: 6,
    endSatisfaction: 6,
    meanIntensity: 6,
    completion: 1,
    interruptionsHonored: 0,
    interruptionsShielded: 0,
  });
  assert.ok(peaky.score > flat.score);
  assert.ok(peaky.score > peaky.experiencedScore); // remembered > experienced
});

test("score: incomplete blocks are penalised", () => {
  const full = scoreSession({ peakIntensity: 8, endSatisfaction: 8, completion: 1, interruptionsHonored: 0, interruptionsShielded: 0 });
  const partial = scoreSession({ peakIntensity: 8, endSatisfaction: 8, completion: 0.3, interruptionsHonored: 0, interruptionsShielded: 0 });
  assert.ok(partial.score < full.score);
});

// ---- streaks ---------------------------------------------------------------

test("streak: one miss spends grace instead of resetting", () => {
  // ...present, present, MISS-yesterday — grace should keep it alive.
  const s = assessStreak([true, true, true, true, false]);
  assert.ok(s.current >= 3);
  assert.match(s.message, /grace|miss/i);
});

test("streak: automaticity grows with total days", () => {
  const few = assessStreak(Array(5).fill(true));
  const many = assessStreak(Array(70).fill(true));
  assert.ok(many.automaticity > few.automaticity);
  assert.ok(many.automaticity > 0.6);
});

// ---- orchestrator ----------------------------------------------------------

test("buildFocusPlan: assembles a coherent, finishable plan", () => {
  const plan = buildFocusPlan(baseCtx, "deep");
  assert.ok(plan.session.workMinutes > 0);
  assert.ok(plan.readiness > 0 && plan.readiness <= 1);
  assert.ok(plan.startRitual.length >= 2);
  assert.ok(plan.motivation.length > 0);
  assert.ok(plan.predictedBreak.minutes >= 0);
});

test("buildFocusPlan: warns when working against the circadian grain", () => {
  const owlAtDawn = buildFocusPlan({ ...baseCtx, chronotype: "owl", localHour: 5 }, "deep");
  assert.ok(owlAtDawn.warnings.length > 0);
  assert.ok(owlAtDawn.readiness < buildFocusPlan(baseCtx, "deep").readiness);
});
