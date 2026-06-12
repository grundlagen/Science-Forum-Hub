import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampPlannedMinutes,
  elapsedSeconds,
  remainingSeconds,
  isExpired,
  deriveOutcome,
  requiresAbandonReason,
  suggestBreakMinutes,
  weekStart,
  median,
  weeksActive,
  adaptiveDefaultMinutes,
  closureMessage,
  DEFAULT_SESSION_MINUTES,
} from "./focusGuard";

const T0 = new Date("2026-06-10T12:00:00Z"); // a Wednesday

test("clampPlannedMinutes defaults and clamps to the 10–90 ultradian window", () => {
  assert.equal(clampPlannedMinutes(undefined), DEFAULT_SESSION_MINUTES);
  assert.equal(clampPlannedMinutes(NaN), DEFAULT_SESSION_MINUTES);
  assert.equal(clampPlannedMinutes(3), 10);
  assert.equal(clampPlannedMinutes(500), 90);
  assert.equal(clampPlannedMinutes(25.4), 25);
  assert.equal(clampPlannedMinutes(42), 42);
});

test("elapsed and remaining seconds", () => {
  const later = new Date(T0.getTime() + 10 * 60 * 1000);
  assert.equal(elapsedSeconds(T0, later), 600);
  assert.equal(remainingSeconds(T0, 25, later), 15 * 60);
  assert.equal(remainingSeconds(T0, 5, later), 0);
  assert.equal(elapsedSeconds(later, T0), 0);
});

test("isExpired honors planned time plus the grace period", () => {
  const at = (min: number) => new Date(T0.getTime() + min * 60 * 1000);
  assert.equal(isExpired(T0, 25, at(54)), false);
  assert.equal(isExpired(T0, 25, at(56)), true);
});

test("deriveOutcome: abandon wins, overrun starts at 125% of plan", () => {
  assert.equal(deriveOutcome("abandon", 10_000, 25), "abandoned");
  assert.equal(deriveOutcome("complete", 24 * 60, 25), "completed");
  assert.equal(deriveOutcome("complete", 31 * 60, 25), "completed");
  assert.equal(deriveOutcome("complete", 32 * 60, 25), "overran");
});

test("requiresAbandonReason: only ulysses mode, only early", () => {
  assert.equal(requiresAbandonReason("ulysses", "abandon", 10 * 60, 25), true);
  assert.equal(requiresAbandonReason("ulysses", "abandon", 26 * 60, 25), false);
  assert.equal(requiresAbandonReason("ulysses", "complete", 10 * 60, 25), false);
  assert.equal(requiresAbandonReason("gentle", "abandon", 10 * 60, 25), false);
});

test("suggestBreakMinutes is duration/5, floored at 5, capped at 20", () => {
  assert.equal(suggestBreakMinutes(10 * 60), 5);
  assert.equal(suggestBreakMinutes(50 * 60), 10);
  assert.equal(suggestBreakMinutes(90 * 60), 18);
  assert.equal(suggestBreakMinutes(300 * 60), 20);
});

test("weekStart anchors to Monday 00:00 UTC", () => {
  assert.equal(weekStart(T0).toISOString(), "2026-06-08T00:00:00.000Z");
  const sunday = new Date("2026-06-14T23:59:59Z");
  assert.equal(weekStart(sunday).toISOString(), "2026-06-08T00:00:00.000Z");
  const monday = new Date("2026-06-08T00:00:00Z");
  assert.equal(weekStart(monday).toISOString(), "2026-06-08T00:00:00.000Z");
});

test("median", () => {
  assert.equal(median([]), null);
  assert.equal(median([7]), 7);
  assert.equal(median([1, 3, 9]), 3);
  assert.equal(median([1, 3, 5, 9]), 4);
});

test("weeksActive counts consecutive weeks and tolerates an in-progress week", () => {
  const w = (iso: string) => new Date(iso);
  // Activity this week and the two prior weeks.
  assert.equal(
    weeksActive([w("2026-06-09T10:00:00Z"), w("2026-06-02T10:00:00Z"), w("2026-05-28T10:00:00Z")], T0),
    3,
  );
  // No activity yet this week: chain counts back from last week, unbroken.
  assert.equal(weeksActive([w("2026-06-02T10:00:00Z"), w("2026-05-28T10:00:00Z")], T0), 2);
  // A gap breaks the chain.
  assert.equal(weeksActive([w("2026-06-09T10:00:00Z"), w("2026-05-19T10:00:00Z")], T0), 1);
  assert.equal(weeksActive([], T0), 0);
});

test("adaptiveDefaultMinutes shifts only on a clear recent pattern", () => {
  assert.equal(adaptiveDefaultMinutes([], 25), 25);
  assert.equal(adaptiveDefaultMinutes(["overwhelmed"], 25), 25);
  assert.equal(adaptiveDefaultMinutes(["overwhelmed", "overwhelmed", "engaged"], 25), 15);
  assert.equal(adaptiveDefaultMinutes(["too_easy", "too_easy"], 25), 35);
  // A tie is not a pattern.
  assert.equal(adaptiveDefaultMinutes(["too_easy", "too_easy", "overwhelmed", "overwhelmed"], 25), 25);
  // Clamped at the ultradian bounds.
  assert.equal(adaptiveDefaultMinutes(["overwhelmed", "overwhelmed"], 15), 10);
  assert.equal(adaptiveDefaultMinutes(["too_easy", "too_easy"], 85), 90);
  // Only the most recent 6 ratings count.
  const stale = ["engaged", "engaged", "engaged", "engaged", "engaged", "engaged", "too_easy", "too_easy"] as const;
  assert.equal(adaptiveDefaultMinutes([...stale], 25), 25);
});

test("closure copy is factual and never shaming", () => {
  for (const outcome of ["completed", "abandoned", "overran", "expired"] as const) {
    const msg = closureMessage(outcome, 9 * 60, 25, 3);
    assert.ok(msg.length > 20);
    assert.doesNotMatch(msg, /fail|shame|lazy|weak|guilt/i);
  }
  assert.match(closureMessage("abandoned", 9 * 60, 25, 3), /9 of 25 minutes/);
  assert.match(closureMessage("completed", 25 * 60, 25, 0), /No thoughts needed parking/);
  assert.match(closureMessage("completed", 25 * 60, 25, 1), /parked 1 thought instead/);
});
