/**
 * Focus Guard — the psychology engine.
 *
 * Pure, deterministic functions. No DB, no I/O. Everything here encodes a
 * specific, named finding from the attention / motivation literature so the
 * behaviour is auditable and the rationale survives into the next routine.
 * See docs/focus-guard/DESIGN.md for the bibliography.
 */

import type {
  FocusProfile,
  FocusSession,
  FocusMode,
  Chronotype,
} from "@workspace/db";
import type { ReviewStance } from "@workspace/api-zod";

/** Tunable constants. Kept in one place, each with its grounding. */
export const FOCUS_CONSTANTS = {
  /** Ultradian "basic rest–activity cycle" — productive focus blocks run ~25–90 min. */
  MIN_SESSION_MINUTES: 15,
  MAX_SESSION_MINUTES: 90,
  DEFAULT_SESSION_MINUTES: 50,
  /** Attention Restoration Theory: directed attention needs genuine breaks to recover. */
  DEFAULT_BREAK_MINUTES: 10,
  /** After ~3 hours of cumulative deep work, decision quality degrades (decision fatigue). */
  DAILY_DEEP_WORK_CEILING_MINUTES: 200,
  /** Depletion (1 fresh – 5 spent) at/above this makes consequential judgments risky. */
  DEPLETION_CAUTION: 4,
  DEPLETION_PAUSE: 5,
  /** A kind streak grants this many grace days before it resets (SDT, not dark patterns). */
  DEFAULT_GRACE_TOKENS: 1,
} as const;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** YYYY-MM-DD for a Date in a given IANA timezone (defaults to UTC). */
export function localDateString(date: Date, timeZone = "UTC"): string {
  // en-CA renders ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Whole days between two YYYY-MM-DD strings (b - a). */
export function dayDiff(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86_400_000);
}

export type FocusScoreInput = {
  plannedMinutes: number;
  actualFocusSeconds: number;
  interruptionCount: number;
  flowRating?: number | null;
};

/**
 * Session quality, 0–100. We reward sustained attention and subjective flow,
 * and penalise fragmentation — because attention residue from each switch
 * (Leroy, 2009) degrades the cognitive work that follows.
 */
export function computeFocusScore(input: FocusScoreInput): number {
  const plannedSeconds = Math.max(1, input.plannedMinutes * 60);
  const completion = clamp(input.actualFocusSeconds / plannedSeconds, 0, 1);

  // Diminishing penalty per interruption; the first few hurt most.
  const interruptionPenalty = clamp(1 - input.interruptionCount * 0.08, 0.4, 1);

  // Flow rating (1–5) is the reviewer's own read of depth; weight it gently.
  const flow = input.flowRating ? clamp((input.flowRating - 1) / 4, 0, 1) : 0.5;

  const raw = 100 * (0.6 * completion * interruptionPenalty + 0.4 * flow);
  return Math.round(clamp(raw, 0, 100));
}

/** Is `now` inside a person's high-alertness window for their chronotype? */
export function inPeakWindow(chronotype: Chronotype, hour: number): boolean {
  switch (chronotype) {
    case "lark":
      return hour >= 7 && hour < 12;
    case "owl":
      return hour >= 16 && hour < 23;
    default:
      // Neutral chronotypes get the well-documented late-morning peak.
      return hour >= 9 && hour < 12;
  }
}

export type SessionRecommendation = {
  recommendedMinutes: number;
  takeBreakFirst: boolean;
  reasons: string[];
  encouragement: string;
};

export type RecommendInput = {
  profile: Pick<
    FocusProfile,
    | "preferredSessionMinutes"
    | "preferredBreakMinutes"
    | "chronotype"
    | "dailyGoalMinutes"
    | "gentleMode"
    | "currentStreakDays"
  >;
  /** Completed sessions earlier today, most recent first. */
  todaysSessions: Pick<
    FocusSession,
    "actualFocusSeconds" | "depletionAfter" | "endedAt" | "flowRating"
  >[];
  now: Date;
  timeZone?: string;
};

/**
 * Recommend the next session length and whether to rest first. The shape of the
 * advice changes with cumulative load (decision fatigue), recent depletion, and
 * the user's circadian peak (chronotype). Reasons are returned so the UI can be
 * honest about *why* — autonomy-supportive framing (SDT) rather than commands.
 */
export function recommendSession(input: RecommendInput): SessionRecommendation {
  const { profile, todaysSessions, now } = input;
  const reasons: string[] = [];

  let minutes = clamp(
    profile.preferredSessionMinutes,
    FOCUS_CONSTANTS.MIN_SESSION_MINUTES,
    FOCUS_CONSTANTS.MAX_SESSION_MINUTES,
  );

  const minutesDoneToday = Math.round(
    todaysSessions.reduce((s, x) => s + x.actualFocusSeconds, 0) / 60,
  );
  const lastDepletion = todaysSessions[0]?.depletionAfter ?? null;

  let takeBreakFirst = false;

  // 1. Cumulative load → shrink the block and rest (decision fatigue).
  if (minutesDoneToday >= FOCUS_CONSTANTS.DAILY_DEEP_WORK_CEILING_MINUTES) {
    minutes = clamp(Math.round(minutes * 0.5), FOCUS_CONSTANTS.MIN_SESSION_MINUTES, minutes);
    takeBreakFirst = true;
    reasons.push(
      `You've already done ${minutesDoneToday} min of deep work today. Judgment quality drops past ~3 hours — consider a short, lighter session or stopping here.`,
    );
  } else if (minutesDoneToday >= profile.dailyGoalMinutes) {
    reasons.push(
      `You've hit today's ${profile.dailyGoalMinutes}-min goal. Anything more is a bonus, so keep it light.`,
    );
  }

  // 2. Recent depletion → rest before the next block (Attention Restoration Theory).
  if (lastDepletion !== null && lastDepletion >= FOCUS_CONSTANTS.DEPLETION_CAUTION) {
    takeBreakFirst = true;
    minutes = clamp(Math.round(minutes * 0.7), FOCUS_CONSTANTS.MIN_SESSION_MINUTES, minutes);
    reasons.push(
      `Your last session left you fairly depleted. A ${profile.preferredBreakMinutes}-min restorative break first will protect the quality of your review.`,
    );
  }

  // 3. Circadian fit → a gentle nudge, never a block.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: input.timeZone ?? "UTC",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  if (inPeakWindow(profile.chronotype, hour)) {
    reasons.push("This is near your peak-alertness window — a good time for the hardest paper.");
  } else if (profile.chronotype !== "neutral") {
    reasons.push(
      "You're outside your usual peak hours, so favour reading/triage over final verdicts.",
    );
  }

  if (reasons.length === 0) {
    reasons.push("Conditions look good. One paper, one clear intention, no tabs.");
  }

  const encouragement = pickEncouragement(profile.gentleMode, profile.currentStreakDays);

  return { recommendedMinutes: minutes, takeBreakFirst, reasons, encouragement };
}

function pickEncouragement(gentleMode: boolean, streak: number): string {
  if (gentleMode) {
    return "No pressure today. Even ten honest minutes counts as showing up.";
  }
  if (streak >= 7) return `${streak} days of deliberate practice. Craft compounds.`;
  if (streak >= 3) return `Day ${streak + 1}. Disagreement is a feature; so is patience.`;
  return "Rigor is a craft. Start one clean block.";
}

/** The disconfirmation prompt shown before a critical verdict. */
export function steelmanPromptFor(stance: ReviewStance | string): string | null {
  if (stance === "reject") {
    return "Before you reject: write the single strongest case FOR this paper. If you can't, you may not have understood it yet. (Guards against confirmation bias.)";
  }
  if (stance === "challenge") {
    return "Before you challenge: name one thing this paper gets right. A challenge lands harder when it's clearly not dismissive.";
  }
  if (stance === "endorse") {
    return "Before you endorse: name the one finding most likely to be wrong. Endorsement is strongest when you've actively looked for the crack.";
  }
  return null;
}

export type ReviewReadinessInput = {
  profile: Pick<
    FocusProfile,
    "depletionGuardEnabled" | "steelmanGuardEnabled" | "blindPassEnabled" | "gentleMode"
  >;
  stance: ReviewStance | string;
  /** Current self-reported depletion 1–5, if known (e.g. from an active session). */
  depletion?: number | null;
  /** Whether the reviewer formed a private judgment before seeing others' reviews. */
  blindPassDone?: boolean;
  /** Whether there is an active focus session backing this review. */
  hasActiveFocusSession?: boolean;
};

export type ReviewReadiness = {
  level: "ok" | "caution" | "pause";
  ok: boolean;
  warnings: string[];
  suggestions: string[];
  steelmanPrompt: string | null;
};

/**
 * The cognitive guard that runs the moment before a reviewer casts a verdict.
 * It never blocks — autonomy is preserved — but it surfaces the biases most
 * corrosive to peer review: order/anchoring bias, confirmation bias, and
 * judging while depleted.
 */
export function assessReviewReadiness(input: ReviewReadinessInput): ReviewReadiness {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  let level: ReviewReadiness["level"] = "ok";

  const consequential = input.stance === "reject" || input.stance === "challenge";

  // Depletion guard (decision fatigue). Heaviest weight on rejections.
  if (input.profile.depletionGuardEnabled && input.depletion != null) {
    if (input.depletion >= FOCUS_CONSTANTS.DEPLETION_PAUSE && consequential) {
      level = "pause";
      warnings.push(
        "You're running on empty and about to cast a consequential verdict. Depleted reviewers are harsher and less accurate — sleep on it.",
      );
    } else if (input.depletion >= FOCUS_CONSTANTS.DEPLETION_CAUTION) {
      level = "caution";
      warnings.push(
        "You reported high cognitive depletion. Consider a short break before finalising.",
      );
    }
  }

  // Order/anchoring bias: forming a view AFTER reading others anchors you to them.
  if (input.profile.blindPassEnabled && input.blindPassDone === false) {
    if (level === "ok") level = "caution";
    suggestions.push(
      "Do a blind first pass: form your own verdict before reading existing reviews, to avoid anchoring on the first opinion you saw.",
    );
  }

  // Confirmation-bias steelman, only for consequential stances.
  const steelmanPrompt =
    input.profile.steelmanGuardEnabled && consequential
      ? steelmanPromptFor(input.stance)
      : null;

  if (input.hasActiveFocusSession === false && consequential && !input.profile.gentleMode) {
    suggestions.push(
      "Consequential reviews are best written inside a focus session — one paper, full attention.",
    );
  }

  return {
    level,
    ok: level !== "pause",
    warnings,
    suggestions,
    steelmanPrompt,
  };
}

export type StreakUpdate = {
  currentStreakDays: number;
  longestStreakDays: number;
  graceTokens: number;
  lastSessionDate: string;
};

/**
 * Kind-streak logic. Unlike punitive streaks (which weaponise loss aversion and
 * erode intrinsic motivation, per SDT), a single missed day spends a *grace
 * token* instead of resetting to zero. Tokens slowly replenish. The streak is a
 * record of practice, not a leash.
 */
export function applyStreak(
  prev: Pick<
    FocusProfile,
    "currentStreakDays" | "longestStreakDays" | "graceTokens" | "lastSessionDate"
  >,
  today: string,
): StreakUpdate {
  const last = prev.lastSessionDate;

  // First ever session, or same-day repeat — streak unchanged but counted.
  if (!last) {
    return {
      currentStreakDays: 1,
      longestStreakDays: Math.max(1, prev.longestStreakDays),
      graceTokens: prev.graceTokens,
      lastSessionDate: today,
    };
  }
  const gap = dayDiff(last, today);
  if (gap <= 0) {
    // Same day (or clock skew) — no change to the streak count.
    return {
      currentStreakDays: prev.currentStreakDays,
      longestStreakDays: prev.longestStreakDays,
      graceTokens: prev.graceTokens,
      lastSessionDate: today,
    };
  }
  if (gap === 1) {
    const next = prev.currentStreakDays + 1;
    // Earn back a grace token roughly weekly, capped.
    const replenished = next % 7 === 0 ? Math.min(prev.graceTokens + 1, 3) : prev.graceTokens;
    return {
      currentStreakDays: next,
      longestStreakDays: Math.max(next, prev.longestStreakDays),
      graceTokens: replenished,
      lastSessionDate: today,
    };
  }
  // Missed one or more days. Spend grace tokens to cover the gap if possible.
  const missed = gap - 1;
  if (missed <= prev.graceTokens) {
    const next = prev.currentStreakDays + 1;
    return {
      currentStreakDays: next,
      longestStreakDays: Math.max(next, prev.longestStreakDays),
      graceTokens: prev.graceTokens - missed,
      lastSessionDate: today,
    };
  }
  // Gap too large — restart kindly with a fresh grace token.
  return {
    currentStreakDays: 1,
    longestStreakDays: prev.longestStreakDays,
    graceTokens: FOCUS_CONSTANTS.DEFAULT_GRACE_TOKENS,
    lastSessionDate: today,
  };
}

/** A short, kind, honest reflection shown after a session completes. */
export function reflectionFor(
  score: number,
  mode: FocusMode,
  interruptionCount: number,
  gentleMode: boolean,
): string {
  const noun =
    mode === "review" ? "review" : mode === "write" ? "writing" : mode === "triage" ? "triage" : "reading";
  if (gentleMode) {
    return `You showed up for a ${noun} block. That's the whole game — be kind to yourself.`;
  }
  if (score >= 85) return `Deep ${noun} block (${score}/100). This is what good judgment is built from.`;
  if (score >= 65) {
    return interruptionCount > 2
      ? `Solid ${noun} block (${score}/100), though it got fragmented — try parking distractions next time.`
      : `Solid ${noun} block (${score}/100). Steady craft.`;
  }
  if (score >= 40)
    return `A scattered ${noun} block (${score}/100). No judgment — name one thing that broke focus and guard it next time.`;
  return `Short and choppy (${score}/100). Even a rough block beats a skipped one. Reset and try a smaller one.`;
}
