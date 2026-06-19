/**
 * Regression tests for the Focus Guard engine.
 *
 * Run with: `pnpm --filter @workspace/focus-engine test`
 * (Node's built-in test runner via tsx — no extra dependencies.)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assessIntention,
  recommendBlock,
  computeFocusScore,
  buildReflection,
  decideContextSwitch,
  recommendBreak,
  computeStreaks,
  adviseDailyLoad,
  isPeakWindow,
  TECHNIQUE_PRESETS,
} from "./index";

test("intention: a vague phrase scores low and yields suggestions", () => {
  const a = assessIntention("work on stuff");
  assert.ok(a.score <= 20, `expected low score, got ${a.score}`);
  assert.equal(a.signals.isVague, true);
  assert.ok(a.suggestions.length > 0);
});

test("intention: a concrete implementation intention scores high", () => {
  const a = assessIntention(
    "Review section 3 of the Higgs reproduction paper so I can decide my vote",
  );
  assert.ok(a.score >= 80, `expected high score, got ${a.score}`);
  assert.equal(a.signals.hasActionVerb, true);
  assert.equal(a.signals.hasConcreteObject, true);
  assert.equal(a.suggestions.length, 0);
});

test("intention: empty text scores zero", () => {
  assert.equal(assessIntention("   ").score, 0);
});

test("recommend: low energy holds the block short even for deep work", () => {
  const r = recommendBlock({
    technique: "deep_work",
    mode: "writing",
    energy: 1,
    chronotype: "owl",
    localHour: 9,
  });
  assert.ok(r.workMinutes <= 45, `low energy should cap the block, got ${r.workMinutes}`);
  assert.ok(r.breakMinutes >= 5);
});

test("recommend: peak window is detected and surfaced", () => {
  const r = recommendBlock({
    technique: "pomodoro",
    mode: "reading",
    energy: 4,
    chronotype: "lark",
    localHour: 8,
  });
  assert.equal(r.atPeak, true);
});

test("peak windows differ by chronotype", () => {
  assert.equal(isPeakWindow("lark", 8), true);
  assert.equal(isPeakWindow("lark", 20), false);
  assert.equal(isPeakWindow("owl", 20), true);
  assert.equal(isPeakWindow("owl", 8), false);
});

test("score: a protected, completed session lands high", () => {
  const s = computeFocusScore({
    plannedMinutes: 50,
    focusedMinutes: 48,
    distractionCount: 1,
    parkedThoughts: 2,
    flowRating: 4,
    intentionOutcome: "completed",
  });
  assert.ok(s.score >= 85, `expected strong score, got ${s.score}`);
  assert.equal(s.tier, "exemplary");
});

test("score: a parked thought is penalised far less than a chased distraction", () => {
  const base = {
    plannedMinutes: 50,
    focusedMinutes: 50,
    flowRating: null,
    intentionOutcome: "completed" as const,
  };
  const parked = computeFocusScore({ ...base, distractionCount: 0, parkedThoughts: 4 });
  const chased = computeFocusScore({ ...base, distractionCount: 4, parkedThoughts: 0 });
  assert.ok(
    parked.components.depth > chased.components.depth,
    `parking (${parked.components.depth}) should beat chasing (${chased.components.depth})`,
  );
});

test("score: an honest scattered session never bottoms out at zero everywhere", () => {
  const s = computeFocusScore({
    plannedMinutes: 90,
    focusedMinutes: 20,
    distractionCount: 9,
    parkedThoughts: 0,
    flowRating: 1,
    intentionOutcome: "not_met",
  });
  assert.ok(s.score > 0);
  assert.equal(s.tier, "scattered");
});

test("reflection: always offers exactly one next lever", () => {
  const score = computeFocusScore({
    plannedMinutes: 25,
    focusedMinutes: 25,
    distractionCount: 0,
    parkedThoughts: 0,
    flowRating: 5,
    intentionOutcome: "completed",
  });
  const r = buildReflection({
    intention: "Summarize the methods section",
    intentionOutcome: "completed",
    plannedMinutes: 25,
    focusedMinutes: 25,
    distractionCount: 0,
    parkedThoughts: 0,
    score,
  });
  assert.ok(r.nextLever.length > 0);
  assert.ok(r.observations.length >= 2);
});

test("guard: strict blocks off-target switches but always allows breaks", () => {
  assert.equal(
    decideContextSwitch({ level: "strict", isTargetDestination: false, onBreak: false }).verdict,
    "block",
  );
  assert.equal(
    decideContextSwitch({ level: "strict", isTargetDestination: false, onBreak: true }).verdict,
    "allow",
  );
  assert.equal(
    decideContextSwitch({ level: "gentle", isTargetDestination: false, onBreak: false }).verdict,
    "warn",
  );
});

test("break: advice escalates as the block runs over", () => {
  assert.equal(recommendBreak(10, 50).shouldBreakNow, false);
  assert.equal(recommendBreak(50, 50).shouldBreakNow, true);
  assert.ok(recommendBreak(70, 50).fatigue >= recommendBreak(50, 50).fatigue);
});

test("streak: a single missed day is bridged by grace, two are not", () => {
  const withGrace = computeStreaks(
    [
      { date: "2026-06-19", focusedMinutes: 40 },
      { date: "2026-06-18", focusedMinutes: 30 },
      { date: "2026-06-16", focusedMinutes: 25 }, // 17th missed -> grace bridges
      { date: "2026-06-15", focusedMinutes: 25 },
    ],
    "2026-06-19",
  );
  assert.equal(withGrace.currentStreak, 4);
  assert.equal(withGrace.graceUsed, true);

  const broken = computeStreaks(
    [
      { date: "2026-06-19", focusedMinutes: 40 },
      { date: "2026-06-15", focusedMinutes: 25 }, // 3-day gap breaks it
    ],
    "2026-06-19",
  );
  assert.equal(broken.currentStreak, 1);
});

test("streak: days under the qualifying threshold don't count", () => {
  const s = computeStreaks([{ date: "2026-06-19", focusedMinutes: 5 }], "2026-06-19");
  assert.equal(s.currentStreak, 0);
});

test("daily load: past the ceiling we nudge rest, not more work", () => {
  const over = adviseDailyLoad(300, 240);
  assert.equal(over.overCeiling, true);
  assert.match(over.message, /recovery|stop/i);
});

test("every technique preset carries a psychological basis", () => {
  for (const preset of Object.values(TECHNIQUE_PRESETS)) {
    assert.ok(preset.basis.length > 0, `${preset.technique} is missing its basis`);
    assert.ok(preset.workMinutes > 0 && preset.breakMinutes > 0);
  }
});
