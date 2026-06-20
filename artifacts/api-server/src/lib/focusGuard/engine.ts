/**
 * Focus Guard — psychology engine (pure).
 *
 * No I/O, no DB, no clock except what is injected. Everything here is a pure
 * function of its inputs so it can be unit-tested exhaustively and reused on the
 * client for live, optimistic scoring. The DB and routes are thin shells around
 * this module.
 */
import {
  BREAK_RESETS_FATIGUE_MIN,
  DECISION_FATIGUE_REVIEW_LIMIT,
  DECISION_FATIGUE_WARN_AT,
  DISTRACTION_PENALTY_CAP,
  DISTRACTION_PENALTY_PER_EVENT,
  DWELL_TARGET_SEC,
  FLOW_FOCUS_SCORE,
  FLOW_MIN_ACTIVE_SEC,
  FOCUS_WEIGHTS,
  MIN_REVIEW_ENGAGEMENT_SEC,
  MIN_REVIEW_SCROLL_DEPTH,
  REVIEW_WEIGHT_MAX,
  REVIEW_WEIGHT_MIN,
  ULTRADIAN_CYCLE_MIN,
  ULTRADIAN_PEAK_START_MIN,
  ULTRADIAN_TROUGH_MIN,
} from "./constants";
import type {
  FatigueAssessment,
  FatigueInputs,
  FocusScoreBreakdown,
  FocusSignals,
  Nudge,
  ReviewEligibility,
  UltradianPhase,
} from "./types";

// --- small numeric helpers --------------------------------------------------

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;
const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Focus score
// ---------------------------------------------------------------------------

/**
 * Blend engagement, dwell adequacy and scroll coverage into a 0..100 focus
 * score, then subtract a (capped) distraction penalty. A session that was
 * present, long enough, and traversed the material scores high; one that was
 * mostly idle, brief, or fragmented scores low.
 */
export function computeFocusScore(signals: FocusSignals): FocusScoreBreakdown {
  const activeMs = Math.max(0, signals.activeMs);
  const idleMs = Math.max(0, signals.idleMs);
  const totalMs = activeMs + idleMs;

  const engagementRatio = totalMs === 0 ? 0 : clamp01(activeMs / totalMs);

  const target = DWELL_TARGET_SEC[signals.intent] * 1000;
  const dwellAdequacy = target === 0 ? 1 : clamp01(activeMs / target);

  const scrollCoverage = clamp01(signals.scrollDepth);

  const positive =
    FOCUS_WEIGHTS.engagementRatio * engagementRatio +
    FOCUS_WEIGHTS.dwellAdequacy * dwellAdequacy +
    FOCUS_WEIGHTS.scrollCoverage * scrollCoverage;

  const distractionPenalty = Math.min(
    DISTRACTION_PENALTY_CAP,
    Math.max(0, signals.distractionEvents) * DISTRACTION_PENALTY_PER_EVENT,
  );

  const score = clamp(positive * 100 - distractionPenalty, 0, 100);

  const inFlow =
    score >= FLOW_FOCUS_SCORE && activeMs >= FLOW_MIN_ACTIVE_SEC * 1000;

  return {
    score: round1(score),
    engagementRatio: round2(engagementRatio),
    dwellAdequacy: round2(dwellAdequacy),
    scrollCoverage: round2(scrollCoverage),
    distractionPenalty: round1(distractionPenalty),
    inFlow,
  };
}

// ---------------------------------------------------------------------------
// Ultradian phase (Basic Rest–Activity Cycle)
// ---------------------------------------------------------------------------

/**
 * Where on the ~90-minute alertness arc a given amount of continuous active
 * time falls. "rising" = warm-up, "peak" = the productive middle, "trough" =
 * the dip near the end of a cycle where a break pays off most.
 */
export function ultradianPhase(activeMs: number): UltradianPhase {
  const minutesIntoCycle =
    (Math.max(0, activeMs) / 60000) % ULTRADIAN_CYCLE_MIN;
  if (minutesIntoCycle < ULTRADIAN_PEAK_START_MIN) return "rising";
  if (minutesIntoCycle >= ULTRADIAN_CYCLE_MIN - ULTRADIAN_TROUGH_MIN) {
    return "trough";
  }
  return "peak";
}

/** Minutes of continuous active time until the next ultradian trough begins. */
export function minutesToUltradianTrough(activeMs: number): number {
  const minutesIntoCycle =
    (Math.max(0, activeMs) / 60000) % ULTRADIAN_CYCLE_MIN;
  const troughStart = ULTRADIAN_CYCLE_MIN - ULTRADIAN_TROUGH_MIN;
  const delta = troughStart - minutesIntoCycle;
  return round1(delta <= 0 ? 0 : delta);
}

// ---------------------------------------------------------------------------
// Decision fatigue ("hungry judge")
// ---------------------------------------------------------------------------

/**
 * Assess how depleted a reviewer's judgement is, from their run of reviews
 * since the last restorative break. Reliability decays from 1 toward a floor as
 * the count climbs past the warning threshold, and a recent break resets it.
 */
export function assessFatigue(inputs: FatigueInputs): FatigueAssessment {
  const now = inputs.now ?? new Date();
  const n = Math.max(0, inputs.reviewsSinceBreak);

  const minutesSinceBreak = inputs.lastBreakAt
    ? Math.max(0, (now.getTime() - inputs.lastBreakAt.getTime()) / 60000)
    : null;

  // A genuinely recent break wipes the slate: fresh judgement restored.
  const brokeRecently =
    minutesSinceBreak !== null && minutesSinceBreak < BREAK_RESETS_FATIGUE_MIN;
  const effectiveN = brokeRecently ? 0 : n;

  let state: FatigueAssessment["state"];
  if (effectiveN === 0) state = "fresh";
  else if (effectiveN < DECISION_FATIGUE_WARN_AT) state = "warming";
  else if (effectiveN < DECISION_FATIGUE_WARN_AT + 1) state = "optimal";
  else if (effectiveN < DECISION_FATIGUE_REVIEW_LIMIT) state = "tiring";
  else state = "depleted";

  // Reliability: 1.0 while fresh/warming, decaying linearly to ~0.55 at the
  // limit, mirroring the steady fall in judgement quality the literature shows.
  const overWarn = Math.max(0, effectiveN - DECISION_FATIGUE_WARN_AT);
  const span = DECISION_FATIGUE_REVIEW_LIMIT - DECISION_FATIGUE_WARN_AT;
  const reliability =
    effectiveN < DECISION_FATIGUE_WARN_AT
      ? 1
      : clamp(1 - 0.45 * (overWarn / Math.max(1, span)), 0.55, 1);

  return {
    state,
    reviewsSinceBreak: effectiveN,
    minutesSinceBreak: minutesSinceBreak === null ? null : round1(minutesSinceBreak),
    reliability: round2(reliability),
    shouldBreak: state === "depleted",
  };
}

// ---------------------------------------------------------------------------
// Review eligibility (the actual "guard")
// ---------------------------------------------------------------------------

export interface ReviewEligibilityInputs {
  session: FocusSignals | null;
  fatigue: FatigueAssessment;
  /** User-tunable floor; falls back to the psychological default. */
  minReviewEngagementSec?: number;
  enforcementEnabled: boolean;
}

/**
 * Decide whether a review has been *earned* by adequate attention. When
 * enforcement is off this is advisory (blocking=false) — the platform warns but
 * still lets the review through. When on, `blocking` mirrors `!eligible`.
 */
export function reviewEligibility(inputs: ReviewEligibilityInputs): ReviewEligibility {
  const requiredSec = inputs.minReviewEngagementSec ?? MIN_REVIEW_ENGAGEMENT_SEC;
  const requiredScrollDepth = MIN_REVIEW_SCROLL_DEPTH;
  const session = inputs.session;
  const engagedSec = session ? Math.floor(session.activeMs / 1000) : 0;
  const scrollDepth = session ? clamp01(session.scrollDepth) : 0;

  const decide = (
    eligible: boolean,
    reason: ReviewEligibility["reason"],
    message: string,
  ): ReviewEligibility => ({
    eligible,
    engagedSec,
    requiredSec,
    scrollDepth: round2(scrollDepth),
    requiredScrollDepth,
    reason,
    blocking: inputs.enforcementEnabled && !eligible,
    message,
  });

  if (!session) {
    return decide(
      false,
      "no_session",
      "Open and read the paper before casting a review.",
    );
  }
  if (engagedSec < requiredSec) {
    return decide(
      false,
      "insufficient_time",
      `Spend a little longer with this paper first — ${engagedSec}s of ${requiredSec}s of focused reading.`,
    );
  }
  if (scrollDepth < requiredScrollDepth) {
    return decide(
      false,
      "insufficient_coverage",
      `You've seen ${Math.round(scrollDepth * 100)}% of the paper. Read to the end before judging it.`,
    );
  }
  if (inputs.fatigue.shouldBreak) {
    return decide(
      false,
      "fatigued",
      "You've reviewed several papers without a break. A short pause sharply improves judgement quality — take five, then decide.",
    );
  }
  return decide(true, "ok", "You've engaged enough to review fairly. Judge well.");
}

// ---------------------------------------------------------------------------
// Review weighting
// ---------------------------------------------------------------------------

/**
 * Map a session focus score (0..100, or null when none) onto a community-vote
 * weight in [REVIEW_WEIGHT_MIN, REVIEW_WEIGHT_MAX]. Linear, gentle: deep focus
 * earns a modest boost; thin focus is dampened but never silenced. A null score
 * (legacy / no session) is treated as neutral 1.0.
 */
export function reviewWeight(focusScore: number | null | undefined): number {
  if (focusScore == null) return 1;
  const t = clamp01(focusScore / 100);
  return round2(REVIEW_WEIGHT_MIN + (REVIEW_WEIGHT_MAX - REVIEW_WEIGHT_MIN) * t);
}

// ---------------------------------------------------------------------------
// Nudges — the single most useful thing to say right now
// ---------------------------------------------------------------------------

export interface NudgeInputs {
  signals: FocusSignals;
  fatigue: FatigueAssessment;
  ultradianRemindersEnabled: boolean;
  fatigueGuardEnabled: boolean;
}

/**
 * Pick at most one nudge, by priority. We never stack interruptions: protecting
 * attention means being quiet unless there's a clear, single best thing to say.
 * Flow is sacred — when a user is in flow we suppress everything but a "leave
 * them alone" acknowledgement.
 */
export function nextNudge(inputs: NudgeInputs): Nudge | null {
  const { signals, fatigue } = inputs;
  const activeSec = signals.activeMs / 1000;
  const focus = computeFocusScore(signals);

  // Flow state: do not break it. (Csikszentmihalyi)
  if (focus.inFlow) {
    return {
      kind: "flow",
      severity: 1,
      title: "In flow",
      body: "Deep focus detected. Notifications are held until you surface.",
    };
  }

  // Decision fatigue dominates: a depleted judge should stop, not push on.
  if (inputs.fatigueGuardEnabled && fatigue.shouldBreak) {
    return {
      kind: "fatigue_break",
      severity: 3,
      title: "Your judgement is tiring",
      body: "You've reviewed several papers in a row. Like a hungry judge, accuracy drifts. A 5-minute break resets it.",
    };
  }

  // Ultradian trough: well into a long stretch, alertness is dipping.
  const phase = ultradianPhase(signals.activeMs);
  if (inputs.ultradianRemindersEnabled && phase === "trough") {
    return {
      kind: "ultradian_break",
      severity: 2,
      title: "Time for a restorative break",
      body: "You're ~90 minutes into focused work — the natural dip in a rest–activity cycle. Step away briefly to come back sharper.",
    };
  }

  // Reviewing-specific coaching: read more / sit longer before judging.
  if (signals.intent === "review") {
    if (signals.scrollDepth < MIN_REVIEW_SCROLL_DEPTH && activeSec > 20) {
      return {
        kind: "coverage",
        severity: 2,
        title: "Read to the end first",
        body: `You've seen ${Math.round(signals.scrollDepth * 100)}% of the paper. A fair verdict needs the whole argument.`,
      };
    }
    if (activeSec < MIN_REVIEW_ENGAGEMENT_SEC) {
      return {
        kind: "dwell",
        severity: 1,
        title: "Sit with it a moment",
        body: "Strong reviews come from slow reading. Give the ideas room before you decide.",
      };
    }
  }

  if (fatigue.state === "tiring") {
    return {
      kind: "fatigue_break",
      severity: 2,
      title: "Consider a short pause",
      body: "A couple more reviews and judgement starts to slip. A brief break keeps you fair.",
    };
  }

  if (focus.score >= 65 && activeSec > 30) {
    return {
      kind: "encourage",
      severity: 1,
      title: "Nicely focused",
      body: "Good, steady attention. Keep going.",
    };
  }

  return null;
}
