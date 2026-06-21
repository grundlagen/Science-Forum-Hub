import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeFocusScore,
  recommendSession,
  assessReviewReadiness,
  applyStreak,
  steelmanPromptFor,
  inPeakWindow,
  dayDiff,
  localDateString,
  clamp,
  FOCUS_CONSTANTS,
} from "./focus";
import type { FocusProfile } from "@workspace/db";

/** Minimal profile factory so tests state only what they care about. */
function profile(over: Partial<FocusProfile> = {}): FocusProfile {
  return {
    userId: "u1",
    preferredSessionMinutes: 50,
    preferredBreakMinutes: 10,
    dailyGoalMinutes: 90,
    chronotype: "neutral",
    blindPassEnabled: true,
    steelmanGuardEnabled: true,
    depletionGuardEnabled: true,
    gentleMode: false,
    currentStreakDays: 0,
    longestStreakDays: 0,
    graceTokens: 1,
    lastSessionDate: null,
    totalFocusMinutes: 0,
    sessionsCompleted: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

test("clamp bounds values", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
});

test("localDateString + dayDiff", () => {
  assert.equal(localDateString(new Date("2026-06-21T12:00:00Z"), "UTC"), "2026-06-21");
  assert.equal(dayDiff("2026-06-21", "2026-06-22"), 1);
  assert.equal(dayDiff("2026-06-21", "2026-06-21"), 0);
  assert.equal(dayDiff("2026-06-22", "2026-06-21"), -1);
});

test("computeFocusScore: a clean full block scores high", () => {
  const score = computeFocusScore({
    plannedMinutes: 50,
    actualFocusSeconds: 50 * 60,
    interruptionCount: 0,
    flowRating: 5,
  });
  assert.ok(score >= 95, `expected near-perfect, got ${score}`);
});

test("computeFocusScore: interruptions and short time hurt", () => {
  const clean = computeFocusScore({
    plannedMinutes: 50,
    actualFocusSeconds: 50 * 60,
    interruptionCount: 0,
    flowRating: 3,
  });
  const fragmented = computeFocusScore({
    plannedMinutes: 50,
    actualFocusSeconds: 20 * 60,
    interruptionCount: 6,
    flowRating: 3,
  });
  assert.ok(fragmented < clean);
  assert.ok(fragmented >= 0 && fragmented <= 100);
});

test("computeFocusScore: missing flow defaults to neutral, stays in range", () => {
  const score = computeFocusScore({
    plannedMinutes: 25,
    actualFocusSeconds: 25 * 60,
    interruptionCount: 0,
    flowRating: null,
  });
  assert.ok(score >= 0 && score <= 100);
});

test("recommendSession: heavy prior load shrinks the block and rests first", () => {
  const rec = recommendSession({
    profile: profile(),
    todaysSessions: [
      { actualFocusSeconds: FOCUS_CONSTANTS.DAILY_DEEP_WORK_CEILING_MINUTES * 60, depletionAfter: 5, endedAt: new Date(), flowRating: 3 },
    ],
    now: new Date("2026-06-21T10:00:00Z"),
    timeZone: "UTC",
  });
  assert.equal(rec.takeBreakFirst, true);
  assert.ok(rec.recommendedMinutes < profile().preferredSessionMinutes);
  assert.ok(rec.reasons.length > 0);
});

test("recommendSession: fresh start gives a clean recommendation", () => {
  const rec = recommendSession({
    profile: profile(),
    todaysSessions: [],
    now: new Date("2026-06-21T10:00:00Z"),
    timeZone: "UTC",
  });
  assert.equal(rec.takeBreakFirst, false);
  assert.equal(rec.recommendedMinutes, 50);
});

test("inPeakWindow respects chronotype", () => {
  assert.equal(inPeakWindow("lark", 8), true);
  assert.equal(inPeakWindow("lark", 20), false);
  assert.equal(inPeakWindow("owl", 20), true);
  assert.equal(inPeakWindow("owl", 8), false);
});

test("assessReviewReadiness: depleted reject is paused but never hard-blocked elsewhere", () => {
  const r = assessReviewReadiness({
    profile: profile(),
    stance: "reject",
    depletion: 5,
    blindPassDone: true,
    hasActiveFocusSession: true,
  });
  assert.equal(r.level, "pause");
  assert.equal(r.ok, false);
  assert.ok(r.warnings.length > 0);
  assert.ok(r.steelmanPrompt && r.steelmanPrompt.length > 0);
});

test("assessReviewReadiness: clean endorse is ok and has no steelman", () => {
  const r = assessReviewReadiness({
    profile: profile(),
    stance: "endorse",
    depletion: 2,
    blindPassDone: true,
    hasActiveFocusSession: true,
  });
  assert.equal(r.level, "ok");
  assert.equal(r.ok, true);
  assert.equal(r.steelmanPrompt, null);
});

test("assessReviewReadiness: skipping the blind pass is a caution, not a block", () => {
  const r = assessReviewReadiness({
    profile: profile(),
    stance: "endorse",
    depletion: 1,
    blindPassDone: false,
    hasActiveFocusSession: true,
  });
  assert.equal(r.level, "caution");
  assert.equal(r.ok, true);
  assert.ok(r.suggestions.some((s) => /blind/i.test(s)));
});

test("assessReviewReadiness: disabled guards stay quiet", () => {
  const r = assessReviewReadiness({
    profile: profile({
      depletionGuardEnabled: false,
      steelmanGuardEnabled: false,
      blindPassEnabled: false,
    }),
    stance: "reject",
    depletion: 5,
    blindPassDone: false,
    hasActiveFocusSession: true,
  });
  assert.equal(r.level, "ok");
  assert.equal(r.steelmanPrompt, null);
});

test("steelmanPromptFor varies by stance", () => {
  assert.ok(steelmanPromptFor("reject"));
  assert.ok(steelmanPromptFor("challenge"));
  assert.ok(steelmanPromptFor("endorse"));
  assert.equal(steelmanPromptFor("nonsense"), null);
});

test("applyStreak: first session starts a streak of 1", () => {
  const s = applyStreak(
    { currentStreakDays: 0, longestStreakDays: 0, graceTokens: 1, lastSessionDate: null },
    "2026-06-21",
  );
  assert.equal(s.currentStreakDays, 1);
  assert.equal(s.lastSessionDate, "2026-06-21");
});

test("applyStreak: consecutive day increments", () => {
  const s = applyStreak(
    { currentStreakDays: 3, longestStreakDays: 5, graceTokens: 1, lastSessionDate: "2026-06-20" },
    "2026-06-21",
  );
  assert.equal(s.currentStreakDays, 4);
  assert.equal(s.longestStreakDays, 5);
});

test("applyStreak: same day does not double-count", () => {
  const s = applyStreak(
    { currentStreakDays: 3, longestStreakDays: 5, graceTokens: 1, lastSessionDate: "2026-06-21" },
    "2026-06-21",
  );
  assert.equal(s.currentStreakDays, 3);
});

test("applyStreak: a single missed day spends a grace token, keeping the streak", () => {
  const s = applyStreak(
    { currentStreakDays: 4, longestStreakDays: 4, graceTokens: 1, lastSessionDate: "2026-06-19" },
    "2026-06-21", // missed the 20th
  );
  assert.equal(s.currentStreakDays, 5);
  assert.equal(s.graceTokens, 0);
});

test("applyStreak: too large a gap resets kindly with a fresh token", () => {
  const s = applyStreak(
    { currentStreakDays: 9, longestStreakDays: 9, graceTokens: 0, lastSessionDate: "2026-06-10" },
    "2026-06-21",
  );
  assert.equal(s.currentStreakDays, 1);
  assert.equal(s.longestStreakDays, 9);
  assert.equal(s.graceTokens, FOCUS_CONSTANTS.DEFAULT_GRACE_TOKENS);
});

test("applyStreak: weekly milestone replenishes a grace token (capped)", () => {
  const s = applyStreak(
    { currentStreakDays: 6, longestStreakDays: 6, graceTokens: 1, lastSessionDate: "2026-06-20" },
    "2026-06-21", // becomes day 7
  );
  assert.equal(s.currentStreakDays, 7);
  assert.equal(s.graceTokens, 2);
});
