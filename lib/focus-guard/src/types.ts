/**
 * types.ts — the vocabulary of Focus Guard.
 *
 * These types are the contract between the pure engine, the database layer
 * (lib/db/src/schema/focus*.ts) and any UI. Keep them framework-free.
 */

/** Stable circadian disposition. @see CITATIONS.CHRONOTYPE */
export type Chronotype = "lark" | "intermediate" | "owl";

/** What kind of cognitive work a session protects. */
export type SessionMode = "deep" | "shallow" | "review" | "restorative";

/** How a session ended — drives scoring and streak logic. */
export type SessionOutcome =
  | "completed"
  | "extended"
  | "abandoned"
  | "interrupted";

/**
 * The eight channels of the experience-fluctuation model.
 * @see CITATIONS.FLOW
 */
export type FlowChannel =
  | "flow"
  | "arousal"
  | "control"
  | "relaxation"
  | "boredom"
  | "apathy"
  | "worry"
  | "anxiety";

/** Restorative activity classes, ordered roughly by restorative power. */
export type BreakType = "none" | "micro" | "movement" | "social" | "nature" | "rest";

/** Where an interruption originates. */
export type InterruptionSource = "internal" | "external";

/** The concrete shape of an interruption. */
export type InterruptionKind =
  | "thought" // an intrusive idea / open loop
  | "notification"
  | "person"
  | "physical" // hunger, bathroom, discomfort
  | "task"; // an urge to switch to other work

/** How urgent the interrupter claims to be. */
export type InterruptionUrgency = "trivial" | "routine" | "important" | "emergency";

/** The guard's verdict on an interruption. */
export type GuardDecision = "allow" | "defer" | "shield";

/** Where a session sits along its planned arc. */
export type SessionPhase = "warmup" | "deep" | "wind_down" | "overrun";

/** The cue half of an implementation intention. @see CITATIONS.IMPLEMENTATION_INTENTIONS */
export type IntentionCueType = "time" | "location" | "event" | "completion";

export interface ImplementationIntention {
  readonly cueType: IntentionCueType;
  /** e.g. "09:00", "the library", "after standup", "when the build passes". */
  readonly cue: string;
  /** The concrete action, ideally starting with a verb. */
  readonly action: string;
}

/** A single observed task switch, used to estimate attention residue. */
export interface TaskSwitch {
  /** Minutes since the switch happened (0 = just now). */
  readonly minutesAgo: number;
  /** Was the task being left actually finished? Unfinished costs more. */
  readonly completed: boolean;
  /** Did the switch occur under time pressure? Amplifies residue. */
  readonly underTimePressure?: boolean;
}

/** Self-reported state at the moment a session is planned. */
export interface FocusContext {
  readonly chronotype: Chronotype;
  /** Local hour in [0, 24). */
  readonly localHour: number;
  /** Perceived challenge of the task, FLOW.SCALE_MIN..SCALE_MAX. */
  readonly challenge: number;
  /** Perceived skill at the task, FLOW.SCALE_MIN..SCALE_MAX. */
  readonly skill: number;
  /** Current arousal/activation, AROUSAL.SCALE_MIN..SCALE_MAX. */
  readonly arousal: number;
  /** Hours slept last night (budget proxy). */
  readonly sleepHours: number;
  /** Deep sessions already completed today (fatigue/residue proxy). */
  readonly consecutiveSessionsToday: number;
  /** Intensity-weighted deep minutes already spent today. */
  readonly priorDeepMinutesToday: number;
  /** Restorative minutes taken today. */
  readonly restorationMinutesToday: number;
  /** Recent task switches feeding the residue model. */
  readonly recentSwitches?: readonly TaskSwitch[];
  /** Fraction of recent long sessions the user actually completed, 0..1. */
  readonly historicalCompletionRate?: number;
  /** Is an outdoor / green space realistically reachable for breaks? */
  readonly outdoorsAvailable?: boolean;
}

/** Result of placing (challenge, skill) on the flow plane. */
export interface FlowAssessment {
  readonly channel: FlowChannel;
  /** 0..1 — how close this state is to flow. */
  readonly proximity: number;
  /** Is the user currently in (or adjacent to) flow worth protecting? */
  readonly inFlow: boolean;
  readonly guidance: string;
}

/** A recommended work/break cadence. */
export interface SessionPlan {
  readonly mode: SessionMode;
  readonly workMinutes: number;
  readonly breakMinutes: number;
  readonly rationale: readonly string[];
}

/** A recommended restorative break. @see CITATIONS.ATTENTION_RESTORATION */
export interface BreakPlan {
  readonly type: BreakType;
  readonly minutes: number;
  readonly prompt: string;
}

/** The daily cognitive budget snapshot. @see CITATIONS.EGO_DEPLETION (contested) */
export interface BudgetAssessment {
  /** 0..1 remaining self-reported capacity. */
  readonly remaining: number;
  /** Suggested remaining deep-work minutes for the day. */
  readonly recommendedDeepMinutes: number;
  /** Always surfaced: this model rests on a contested effect. */
  readonly caveat: string;
  readonly rationale: readonly string[];
}

/** Attention residue snapshot. @see CITATIONS.ATTENTION_RESIDUE */
export interface ResidueAssessment {
  /** 0..1 residual pull from unfinished prior tasks. */
  readonly residue: number;
  /** 0..1 readiness to begin (= 1 - residue, shaped). */
  readonly readiness: number;
  /** Suggested minutes of "clearing" ritual before deep work. */
  readonly suggestedClearingMinutes: number;
  readonly note: string;
}

/** The guard's decision about a single interruption. */
export interface GuardVerdict {
  readonly decision: GuardDecision;
  readonly reason: string;
  /** Autonomy-supportive message for the user. @see CITATIONS.SELF_DETERMINATION */
  readonly message: string;
  /** If true, capture the thought to the open-loop list. @see CITATIONS.ZEIGARNIK */
  readonly parkThought: boolean;
  /** If deferred, the phase at which to resurface it. */
  readonly deferUntil?: SessionPhase;
}

/** Inputs for scoring a finished session. */
export interface SessionScoreInput {
  /** Most intense focus moment, 0..10. */
  readonly peakIntensity: number;
  /** Satisfaction at the very end, 0..10. */
  readonly endSatisfaction: number;
  /** Average intensity across the session, 0..10 (optional). */
  readonly meanIntensity?: number;
  /** Fraction of the planned block actually worked, 0..1. */
  readonly completion: number;
  /** Count of interruptions the user let through. */
  readonly interruptionsHonored: number;
  /** Count of interruptions the guard successfully shielded. */
  readonly interruptionsShielded: number;
  /** Residue carried into the session, 0..1. */
  readonly residueAtStart?: number;
}

export interface SessionScore {
  /** 0..100 remembered-quality score (peak-end weighted). */
  readonly score: number;
  /** 0..100 raw in-the-moment quality, for comparison. */
  readonly experiencedScore: number;
  readonly grade: "A" | "B" | "C" | "D";
  readonly highlights: readonly string[];
}

/** Streak / habit-strength snapshot. */
export interface StreakAssessment {
  /** Current unbroken (grace-adjusted) streak length in days. */
  readonly current: number;
  readonly longest: number;
  /** 0..1 estimated automaticity. @see CITATIONS.HABIT_FORMATION */
  readonly automaticity: number;
  /** Grace tokens left before a lapse breaks the streak. */
  readonly graceRemaining: number;
  /** Anti "what-the-hell" framing after a miss. @see CITATIONS.WHAT_THE_HELL */
  readonly message: string;
}

/** The fully-assembled plan returned by buildFocusPlan(). */
export interface FocusPlan {
  readonly session: SessionPlan;
  readonly flow: FlowAssessment;
  readonly residue: ResidueAssessment;
  readonly budget: BudgetAssessment;
  readonly predictedBreak: BreakPlan;
  /** 0..1 overall readiness to start a deep session now. */
  readonly readiness: number;
  /** Ordered pre-session ritual steps. */
  readonly startRitual: readonly string[];
  /** Autonomy-supportive motivational frame. @see CITATIONS.SELF_DETERMINATION */
  readonly motivation: string;
  /** Non-blocking advisories (e.g. low sleep, wrong time of day). */
  readonly warnings: readonly string[];
}
