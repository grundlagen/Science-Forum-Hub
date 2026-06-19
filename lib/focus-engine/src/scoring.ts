/**
 * Scoring, feedback, and the guard decision.
 *
 * The focus score is deliberately *honest and kind*. It rewards protecting the
 * block and following through, it treats a thought you *parked* far more gently
 * than a distraction you chased (because writing an intrusive thought down
 * closes the open loop — the Zeigarnik effect), and it never drops to a
 * shaming zero for an honest attempt. Competence feedback that is specific and
 * non-controlling supports intrinsic motivation; contingent, punitive feedback
 * erodes it (Deci, Koestner & Ryan 1999).
 */

import type { GuardLevel, IntentionOutcome, ScoreTier } from "./types";

export function scoreTier(score: number): ScoreTier {
  if (score >= 90) return "exemplary";
  if (score >= 75) return "strong";
  if (score >= 55) return "solid";
  if (score >= 35) return "developing";
  return "scattered";
}

export interface FocusScoreInput {
  /** Minutes the user committed to. */
  plannedMinutes: number;
  /** Minutes actually spent focused (excludes breaks/pauses). */
  focusedMinutes: number;
  /** Unmanaged attention pulls. */
  distractionCount: number;
  /** Intrusive thoughts written down and set aside (Zeigarnik release). */
  parkedThoughts: number;
  /** Self-reported flow, 1-5, or null if not given. */
  flowRating: number | null;
  /** How fully the stated intention was met. */
  intentionOutcome: IntentionOutcome;
}

export interface FocusScoreResult {
  score: number; // 0-100
  tier: ScoreTier;
  components: {
    adherence: number; // 0-100, did you protect the time you committed?
    depth: number; // 0-100, how undistracted/flowing was it?
    followThrough: number; // 0-100, did you finish what you set out to do?
  };
}

function clamp01to100(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/**
 * Adherence: focused time vs. planned time, with mild credit past 100% (you
 * stayed in it) but no runaway reward for overwork.
 */
function adherenceScore(planned: number, focused: number): number {
  if (planned <= 0) return focused > 0 ? 70 : 0;
  const ratio = focused / planned;
  if (ratio >= 1) return clamp01to100(100 - (ratio - 1) * 10); // slight taper past plan
  return clamp01to100(ratio * 100);
}

/**
 * Depth: penalise distractions relative to the length of the block (one
 * distraction in 25 minutes is very different from one in two hours), and fold
 * in self-reported flow when present. Parked thoughts cost a fraction of a
 * real distraction — managing an intrusion is a *skill*, not a failure.
 */
function depthScore(input: FocusScoreInput): number {
  const minutes = Math.max(input.focusedMinutes, 1);
  const effectiveInterruptions = input.distractionCount + input.parkedThoughts * 0.25;
  // Expect roughly one tolerable interruption per 30 focused minutes.
  const tolerated = minutes / 30;
  const excess = Math.max(0, effectiveInterruptions - tolerated);
  let base = 100 - excess * 12;

  if (input.flowRating != null) {
    // Blend the objective signal with the subjective one (60/40).
    const flow100 = ((input.flowRating - 1) / 4) * 100;
    base = base * 0.6 + flow100 * 0.4;
  }
  return clamp01to100(base);
}

function followThroughScore(outcome: IntentionOutcome): number {
  switch (outcome) {
    case "completed":
      return 100;
    case "partial":
      return 65;
    case "not_met":
      return 30;
    case "unset":
      return 55; // no intention set: neutral, but a nudge to set one next time
    default:
      return 55;
  }
}

/**
 * Compose the three components. Weights reflect priorities: showing up and
 * protecting the block (adherence) and staying in it (depth) matter most;
 * follow-through matters but a hard problem can legitimately outlast its plan.
 */
export function computeFocusScore(input: FocusScoreInput): FocusScoreResult {
  const adherence = adherenceScore(input.plannedMinutes, input.focusedMinutes);
  const depth = depthScore(input);
  const followThrough = followThroughScore(input.intentionOutcome);

  const score = Math.round(adherence * 0.4 + depth * 0.35 + followThrough * 0.25);
  return {
    score,
    tier: scoreTier(score),
    components: {
      adherence: Math.round(adherence),
      depth: Math.round(depth),
      followThrough: Math.round(followThrough),
    },
  };
}

// ---------------------------------------------------------------------------
// Break recommendation (Attention Restoration Theory)
// ---------------------------------------------------------------------------

export interface BreakAdvice {
  shouldBreakNow: boolean;
  /** 0-1: how depleted directed attention is estimated to be. */
  fatigue: number;
  message: string;
}

/**
 * Should the user break now? Directed attention is a finite resource that
 * fatigues with sustained use and recovers with rest, especially restful,
 * "soft fascination" rest rather than more screen-staring (Kaplan & Kaplan
 * 1989). We treat fatigue as rising past the block length and pushing hard
 * past 1.2x.
 */
export function recommendBreak(elapsedMinutes: number, blockMinutes: number): BreakAdvice {
  const ratio = blockMinutes > 0 ? elapsedMinutes / blockMinutes : 0;
  const fatigue = Math.max(0, Math.min(1, ratio / 1.2));
  if (ratio >= 1.2) {
    return {
      shouldBreakNow: true,
      fatigue,
      message: "You're well past this block. Step away from the screen — a walk restores attention better than a scroll.",
    };
  }
  if (ratio >= 1) {
    return {
      shouldBreakNow: true,
      fatigue,
      message: "Block complete. Take the break you earned before attention quietly degrades.",
    };
  }
  if (ratio >= 0.85) {
    return {
      shouldBreakNow: false,
      fatigue,
      message: "Almost there — find a natural stopping point in the next few minutes.",
    };
  }
  return { shouldBreakNow: false, fatigue, message: "In the zone. Keep going." };
}

// ---------------------------------------------------------------------------
// The guard decision (attention residue)
// ---------------------------------------------------------------------------

export type GuardVerdict = "allow" | "warn" | "block";

export interface GuardDecision {
  verdict: GuardVerdict;
  message: string;
}

export interface GuardContextSwitchInput {
  level: GuardLevel;
  /** Is the destination the session's declared target (paper/task)? */
  isTargetDestination: boolean;
  /** Is the user currently on a break? Switching during a break is fine. */
  onBreak: boolean;
}

/**
 * Decide what to do when the user tries to navigate away mid-block. Switching
 * tasks before finishing leaves "attention residue" that measurably degrades
 * performance on whatever comes next (Leroy 2009). The guard's stance scales
 * with the user's chosen `level`; on-target navigation and breaks are always
 * allowed.
 */
export function decideContextSwitch(input: GuardContextSwitchInput): GuardDecision {
  if (input.onBreak || input.isTargetDestination) {
    return { verdict: "allow", message: "" };
  }
  switch (input.level) {
    case "gentle":
      return {
        verdict: "warn",
        message: "Heads up: leaving mid-block leaves attention residue. Park the thought instead?",
      };
    case "standard":
      return {
        verdict: "warn",
        message: "This isn't your target. Switching now costs you on the way back — continue anyway?",
      };
    case "strict":
      return {
        verdict: "block",
        message: "Guard is strict: stay with the target until a break or the session ends. Park the thought to handle it later.",
      };
    default:
      return { verdict: "warn", message: "" };
  }
}
