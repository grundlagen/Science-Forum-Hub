/**
 * Focus Guard engine tests. Run with: pnpm --filter @workspace/api-server test
 * (node:test via tsx). Pure functions → exhaustive, fast, no mocks.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assessFatigue,
  computeFocusScore,
  minutesToUltradianTrough,
  nextNudge,
  reviewEligibility,
  reviewWeight,
  ultradianPhase,
} from "./engine";
import type { FocusSignals } from "./types";

const sig = (over: Partial<FocusSignals> = {}): FocusSignals => ({
  intent: "review",
  activeMs: 0,
  idleMs: 0,
  scrollDepth: 0,
  distractionEvents: 0,
  ...over,
});

// --- computeFocusScore ------------------------------------------------------

test("focus score is 0 for an empty session", () => {
  assert.equal(computeFocusScore(sig()).score, 0);
});

test("focus score rewards present, complete, undistracted reading", () => {
  const r = computeFocusScore(
    sig({ intent: "review", activeMs: 300_000, idleMs: 0, scrollDepth: 1 }),
  );
  assert.ok(r.score >= 95, `expected high score, got ${r.score}`);
  assert.equal(r.engagementRatio, 1);
  assert.ok(r.inFlow);
});

test("idle time drags down the engagement ratio", () => {
  const r = computeFocusScore(
    sig({ activeMs: 60_000, idleMs: 180_000, scrollDepth: 1 }),
  );
  assert.equal(r.engagementRatio, 0.25);
  assert.ok(r.score < 70);
});

test("distraction events are penalised but capped", () => {
  const base = sig({ activeMs: 300_000, scrollDepth: 1 });
  const a = computeFocusScore({ ...base, distractionEvents: 2 });
  const b = computeFocusScore({ ...base, distractionEvents: 100 });
  assert.equal(a.distractionPenalty, 8);
  assert.equal(b.distractionPenalty, 30); // capped
});

test("score never leaves the 0..100 band", () => {
  const r = computeFocusScore(
    sig({ activeMs: 1, idleMs: 10_000_000, distractionEvents: 9999 }),
  );
  assert.ok(r.score >= 0 && r.score <= 100);
});

test("flow needs both high score and real dwell", () => {
  // High score but short dwell → not flow.
  const short = computeFocusScore(
    sig({ intent: "skim", activeMs: 40_000, scrollDepth: 1 }),
  );
  assert.equal(short.inFlow, false);
});

// --- ultradianPhase ---------------------------------------------------------

test("ultradian phase walks rising → peak → trough", () => {
  assert.equal(ultradianPhase(5 * 60_000), "rising");
  assert.equal(ultradianPhase(45 * 60_000), "peak");
  assert.equal(ultradianPhase(80 * 60_000), "trough");
});

test("ultradian phase wraps every cycle", () => {
  assert.equal(ultradianPhase((90 + 5) * 60_000), "rising");
  assert.equal(minutesToUltradianTrough(0), 75);
  assert.equal(minutesToUltradianTrough(80 * 60_000), 0);
});

// --- assessFatigue ----------------------------------------------------------

test("fresh with no reviews; depleted at the limit", () => {
  assert.equal(assessFatigue({ reviewsSinceBreak: 0, lastBreakAt: null }).state, "fresh");
  const dep = assessFatigue({ reviewsSinceBreak: 5, lastBreakAt: null });
  assert.equal(dep.state, "depleted");
  assert.ok(dep.shouldBreak);
  assert.ok(dep.reliability < 1);
});

test("a recent break resets fatigue to fresh", () => {
  const now = new Date("2026-06-20T12:00:00Z");
  const justBroke = new Date("2026-06-20T11:58:00Z"); // 2 min ago
  const r = assessFatigue({ reviewsSinceBreak: 9, lastBreakAt: justBroke, now });
  assert.equal(r.state, "fresh");
  assert.equal(r.reliability, 1);
  assert.equal(r.shouldBreak, false);
});

test("an old break does not reset fatigue", () => {
  const now = new Date("2026-06-20T12:00:00Z");
  const longAgo = new Date("2026-06-20T11:00:00Z"); // 60 min ago
  const r = assessFatigue({ reviewsSinceBreak: 6, lastBreakAt: longAgo, now });
  assert.equal(r.state, "depleted");
});

// --- reviewEligibility ------------------------------------------------------

test("no session → ineligible, advisory when enforcement off", () => {
  const r = reviewEligibility({
    session: null,
    fatigue: assessFatigue({ reviewsSinceBreak: 0, lastBreakAt: null }),
    enforcementEnabled: false,
  });
  assert.equal(r.eligible, false);
  assert.equal(r.reason, "no_session");
  assert.equal(r.blocking, false);
});

test("too little time → ineligible and blocking under enforcement", () => {
  const r = reviewEligibility({
    session: sig({ activeMs: 10_000, scrollDepth: 1 }),
    fatigue: assessFatigue({ reviewsSinceBreak: 0, lastBreakAt: null }),
    enforcementEnabled: true,
  });
  assert.equal(r.reason, "insufficient_time");
  assert.equal(r.blocking, true);
});

test("enough time but shallow read → coverage gate", () => {
  const r = reviewEligibility({
    session: sig({ activeMs: 200_000, scrollDepth: 0.3 }),
    fatigue: assessFatigue({ reviewsSinceBreak: 0, lastBreakAt: null }),
    enforcementEnabled: false,
  });
  assert.equal(r.reason, "insufficient_coverage");
});

test("fully engaged, fresh → eligible", () => {
  const r = reviewEligibility({
    session: sig({ activeMs: 200_000, scrollDepth: 0.95 }),
    fatigue: assessFatigue({ reviewsSinceBreak: 0, lastBreakAt: null }),
    enforcementEnabled: true,
  });
  assert.equal(r.eligible, true);
  assert.equal(r.reason, "ok");
});

test("engaged but depleted → fatigue gate", () => {
  const r = reviewEligibility({
    session: sig({ activeMs: 200_000, scrollDepth: 0.95 }),
    fatigue: assessFatigue({ reviewsSinceBreak: 6, lastBreakAt: null }),
    enforcementEnabled: true,
  });
  assert.equal(r.reason, "fatigued");
});

test("custom engagement floor is respected", () => {
  const r = reviewEligibility({
    session: sig({ activeMs: 200_000, scrollDepth: 1 }),
    fatigue: assessFatigue({ reviewsSinceBreak: 0, lastBreakAt: null }),
    minReviewEngagementSec: 600,
    enforcementEnabled: false,
  });
  assert.equal(r.reason, "insufficient_time");
  assert.equal(r.requiredSec, 600);
});

// --- reviewWeight -----------------------------------------------------------

test("review weight is neutral for null, bounded otherwise", () => {
  assert.equal(reviewWeight(null), 1);
  assert.equal(reviewWeight(0), 0.5);
  assert.equal(reviewWeight(100), 1.25);
  const mid = reviewWeight(50);
  assert.ok(mid > 0.5 && mid < 1.25);
});

// --- nextNudge --------------------------------------------------------------

test("flow suppresses all other nudges", () => {
  const n = nextNudge({
    signals: sig({ activeMs: 300_000, scrollDepth: 1 }),
    fatigue: assessFatigue({ reviewsSinceBreak: 6, lastBreakAt: null }),
    ultradianRemindersEnabled: true,
    fatigueGuardEnabled: true,
  });
  assert.equal(n?.kind, "flow");
});

test("depletion surfaces a fatigue break (severity 3)", () => {
  const n = nextNudge({
    signals: sig({ intent: "review", activeMs: 40_000, scrollDepth: 0.2 }),
    fatigue: assessFatigue({ reviewsSinceBreak: 6, lastBreakAt: null }),
    ultradianRemindersEnabled: true,
    fatigueGuardEnabled: true,
  });
  assert.equal(n?.kind, "fatigue_break");
  assert.equal(n?.severity, 3);
});

test("fatigue guard can be disabled", () => {
  const n = nextNudge({
    signals: sig({ intent: "review", activeMs: 40_000, scrollDepth: 0.2 }),
    fatigue: assessFatigue({ reviewsSinceBreak: 6, lastBreakAt: null }),
    ultradianRemindersEnabled: false,
    fatigueGuardEnabled: false,
  });
  assert.notEqual(n?.kind, "fatigue_break");
});

test("shallow reviewer is told to read to the end", () => {
  const n = nextNudge({
    signals: sig({ intent: "review", activeMs: 40_000, scrollDepth: 0.2 }),
    fatigue: assessFatigue({ reviewsSinceBreak: 0, lastBreakAt: null }),
    ultradianRemindersEnabled: true,
    fatigueGuardEnabled: true,
  });
  assert.equal(n?.kind, "coverage");
});

test("quiet when there is nothing useful to say", () => {
  const n = nextNudge({
    signals: sig({ intent: "read", activeMs: 5_000, scrollDepth: 0.1 }),
    fatigue: assessFatigue({ reviewsSinceBreak: 0, lastBreakAt: null }),
    ultradianRemindersEnabled: true,
    fatigueGuardEnabled: true,
  });
  assert.equal(n, null);
});
