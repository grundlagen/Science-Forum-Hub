import type { FocusIntent, UltradianPhase } from "@workspace/db";

export type { FocusIntent, UltradianPhase };

export type FatigueState = "fresh" | "warming" | "optimal" | "tiring" | "depleted";

/** Raw signals captured for a session — the engine's only input about "now". */
export interface FocusSignals {
  intent: FocusIntent;
  activeMs: number;
  idleMs: number;
  scrollDepth: number; // 0..1
  distractionEvents: number;
}

/** Breakdown of how a focus score was reached (for transparency in the UI). */
export interface FocusScoreBreakdown {
  score: number; // 0..100
  engagementRatio: number; // 0..1 active / total
  dwellAdequacy: number; // 0..1 active vs intent target
  scrollCoverage: number; // 0..1
  distractionPenalty: number; // points subtracted
  inFlow: boolean;
}

/** Rolling, cross-session fatigue picture for a user during a work session. */
export interface FatigueInputs {
  reviewsSinceBreak: number;
  lastBreakAt: Date | null;
  now?: Date;
}

export interface FatigueAssessment {
  state: FatigueState;
  reviewsSinceBreak: number;
  minutesSinceBreak: number | null;
  /** Multiplier (0..1) describing how trustworthy fresh judgements are now. */
  reliability: number;
  shouldBreak: boolean;
}

/** Whether a review may be cast, and why / why not. */
export interface ReviewEligibility {
  eligible: boolean;
  engagedSec: number;
  requiredSec: number;
  scrollDepth: number;
  requiredScrollDepth: number;
  /** Machine-readable reason code. */
  reason:
    | "ok"
    | "no_session"
    | "insufficient_time"
    | "insufficient_coverage"
    | "fatigued";
  /** Whether the platform should hard-block (enforcement) vs. merely warn. */
  blocking: boolean;
  message: string;
}

export type NudgeKind =
  | "encourage" // you're in a good place, keep going
  | "ultradian_break" // ~90 min: take a restorative break
  | "fatigue_break" // decision fatigue: pause before more reviews
  | "coverage" // read more before judging
  | "dwell" // slow down, sit with it longer
  | "flow"; // you're in flow — protected, no interruptions

export interface Nudge {
  kind: NudgeKind;
  /** lower = gentler/ambient, higher = should surface prominently. */
  severity: 1 | 2 | 3;
  title: string;
  body: string;
}
