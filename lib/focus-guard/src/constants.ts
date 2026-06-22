/**
 * constants.ts — the engine's "knowledge base".
 *
 * Every magic number in Focus Guard lives here, bound to the psychological
 * principle it encodes and the source it comes from. Treat this file as
 * documentation as much as configuration: if you change a number, change it
 * because the literature (or our own telemetry) tells you to, and note why.
 *
 * IMPORTANT EPISTEMIC CAVEAT
 * --------------------------
 * These constants are *priors*, not laws of nature. Human attention is
 * heterogeneous and several of the findings below are contested (notably
 * ego depletion — see FOCUS_BUDGET). The engine is built so that per-user
 * telemetry can override these defaults over time. Until we have a user's
 * own data, we lean on these population-level estimates and we say so in
 * every rationale we emit.
 */

export interface Citation {
  readonly id: string;
  readonly claim: string;
  readonly source: string;
  /** How strongly we trust this for engine decisions. */
  readonly confidence: "high" | "moderate" | "contested";
}

/**
 * The bibliography. Each engine module references these by id so a reviewer
 * can trace any recommendation back to its evidence.
 */
export const CITATIONS: Record<string, Citation> = {
  ULTRADIAN: {
    id: "ULTRADIAN",
    claim:
      "Human arousal and alertness cycle in ~90-120 minute ultradian rhythms (the Basic Rest-Activity Cycle).",
    source: "Kleitman, N. (1963/1982). Basic Rest-Activity Cycle.",
    confidence: "moderate",
  },
  FLOW: {
    id: "FLOW",
    claim:
      "Optimal experience ('flow') emerges when perceived challenge and perceived skill are both high and roughly balanced; the challenge/skill plane partitions into eight experiential channels.",
    source:
      "Csikszentmihalyi (1990); Massimini & Carli (1988), Experience Fluctuation Model.",
    confidence: "high",
  },
  ATTENTION_RESTORATION: {
    id: "ATTENTION_RESTORATION",
    claim:
      "Directed attention fatigues and is restored by environments offering 'soft fascination' — especially nature — more effectively than effortful stimulation.",
    source: "Kaplan & Kaplan (1989); Kaplan, S. (1995), Attention Restoration Theory.",
    confidence: "high",
  },
  ATTENTION_RESIDUE: {
    id: "ATTENTION_RESIDUE",
    claim:
      "Switching tasks before completion leaves 'attention residue' that degrades performance on the next task; residue is worse under time pressure and for unfinished tasks.",
    source: "Leroy, S. (2009). Why is it so hard to do my work?",
    confidence: "high",
  },
  EGO_DEPLETION: {
    id: "EGO_DEPLETION",
    claim:
      "Self-control may draw on a limited, depletable resource. This is CONTESTED: large pre-registered replications failed to find the effect at the originally reported size.",
    source:
      "Baumeister et al. (1998); Hagger et al. (2016, RRR, null); Friese et al. (2019, meta-analysis).",
    confidence: "contested",
  },
  ZEIGARNIK: {
    id: "ZEIGARNIK",
    claim:
      "Unfinished tasks remain cognitively active and intrude on attention; committing to a concrete plan for them releases the intrusion.",
    source: "Zeigarnik (1927); Masicampo & Baumeister (2011).",
    confidence: "moderate",
  },
  IMPLEMENTATION_INTENTIONS: {
    id: "IMPLEMENTATION_INTENTIONS",
    claim:
      "Specifying behaviour as an if-then plan ('if situation X, then I will do Y') roughly doubles goal attainment versus mere goal intentions.",
    source: "Gollwitzer (1999); Gollwitzer & Sheeran (2006), meta-analysis (d ~0.65).",
    confidence: "high",
  },
  SELF_DETERMINATION: {
    id: "SELF_DETERMINATION",
    claim:
      "Sustained motivation depends on autonomy, competence and relatedness; controlling, coercive nudges undermine intrinsic motivation.",
    source: "Deci & Ryan (1985, 2000), Self-Determination Theory.",
    confidence: "high",
  },
  YERKES_DODSON: {
    id: "YERKES_DODSON",
    claim:
      "Performance relates to arousal as an inverted-U: too little or too much arousal both impair complex cognitive work.",
    source: "Yerkes & Dodson (1908); Diamond et al. (2007).",
    confidence: "moderate",
  },
  PEAK_END: {
    id: "PEAK_END",
    claim:
      "Remembered quality of an episode is dominated by its most intense moment and its end, with relative neglect of duration.",
    source: "Kahneman et al. (1993); Fredrickson & Kahneman (1993).",
    confidence: "high",
  },
  HABIT_FORMATION: {
    id: "HABIT_FORMATION",
    claim:
      "Automaticity of a new behaviour grows asymptotically; median time to plateau was ~66 days, and a single missed occasion does not meaningfully reset progress.",
    source: "Lally et al. (2010).",
    confidence: "moderate",
  },
  WHAT_THE_HELL: {
    id: "WHAT_THE_HELL",
    claim:
      "After a single lapse, people tend to abandon the goal entirely ('what-the-hell effect'); framing a lapse as recoverable prevents the cascade.",
    source: "Polivy & Herman (1985); Cochran & Tesser (1996).",
    confidence: "moderate",
  },
  CHRONOTYPE: {
    id: "CHRONOTYPE",
    claim:
      "Individuals differ stably in circadian phase (morning vs evening types); cognitive peaks track chronotype and the 'synchrony effect' boosts performance at one's optimal time.",
    source: "Horne & Östberg (1976); May & Hasher (1998).",
    confidence: "high",
  },
  POST_LUNCH_DIP: {
    id: "POST_LUNCH_DIP",
    claim:
      "Alertness reliably dips in the early afternoon (~13:00-15:00) independent of food intake.",
    source: "Monk (2005), The post-lunch dip in performance.",
    confidence: "moderate",
  },
  POMODORO: {
    id: "POMODORO",
    claim:
      "Fixed timeboxes with enforced breaks reduce the activation energy to start and bound rumination; the canonical box is 25 minutes.",
    source: "Cirillo (2006), The Pomodoro Technique.",
    confidence: "moderate",
  },
};

/** Ultradian / Basic Rest-Activity Cycle. @see CITATIONS.ULTRADIAN */
export const ULTRADIAN = {
  /** A full BRAC, the upper bound for an unbroken deep-work block. */
  CYCLE_MINUTES: 90,
  /** Smallest box we will ever recommend (a single Pomodoro). */
  MIN_BLOCK_MINUTES: 25,
  /** Hard ceiling; beyond this directed attention degrades for most people. */
  MAX_BLOCK_MINUTES: 110,
  /** Restorative trough that follows a cycle. */
  TROUGH_MINUTES: 20,
} as const;

/** Pomodoro defaults. @see CITATIONS.POMODORO */
export const POMODORO = {
  WORK_MINUTES: 25,
  SHORT_BREAK_MINUTES: 5,
  LONG_BREAK_MINUTES: 20,
  BLOCKS_BEFORE_LONG_BREAK: 4,
} as const;

/** Flow / experience-fluctuation model. @see CITATIONS.FLOW */
export const FLOW = {
  /** Likert scale bounds used for challenge & skill self-reports. */
  SCALE_MIN: 1,
  SCALE_MAX: 10,
  /** Personal mean used as the channel origin when no history exists. */
  DEFAULT_MEAN: 5.5,
  /**
   * Half-width of the "medium" band around the personal mean, as a fraction
   * of the scale. Inside this band a dimension counts as neither high nor low.
   */
  MEDIUM_BAND_FRACTION: 0.15,
  /** Max challenge/skill imbalance (scale units) still considered "balanced". */
  BALANCE_TOLERANCE: 2,
} as const;

/** Attention residue from task switching. @see CITATIONS.ATTENTION_RESIDUE */
export const RESIDUE = {
  /** Time constant (minutes) of residue decay after a switch. */
  DECAY_MINUTES: 20,
  /** Saturation scale: how many "switch units" map toward full residue. */
  SATURATION_SCALE: 2.5,
  /** Weight of a switch left *incomplete* (the costly kind). */
  WEIGHT_INCOMPLETE: 1,
  /** Weight of a switch from a *completed* task (cheaper). */
  WEIGHT_COMPLETE: 0.35,
  /** Multiplier when the switch happened under time pressure. */
  TIME_PRESSURE_MULTIPLIER: 1.4,
} as const;

/** Attention Restoration Theory break model. @see CITATIONS.ATTENTION_RESTORATION */
export const RESTORATION = {
  MICRO_MINUTES: 5,
  STANDARD_MINUTES: 15,
  DEEP_MINUTES: 30,
  /** Depletion above which nature/soft-fascination is strongly preferred. */
  NATURE_THRESHOLD: 0.5,
  /** Depletion below which a micro-break suffices. */
  MICRO_THRESHOLD: 0.25,
} as const;

/**
 * Daily cognitive budget. @see CITATIONS.EGO_DEPLETION
 *
 * NOTE: modelled as a SELF-REPORTED RESOURCE, not a physiological law. The
 * underlying ego-depletion effect is contested, so we keep the budget soft:
 * it informs gentle pacing advice and is always overridable by the user.
 */
export const FOCUS_BUDGET = {
  /** Intensity-weighted deep-work minutes a well-rested person can sustain. */
  BASELINE_CAPACITY_MINUTES: 240,
  /** Sleep hours considered fully restorative. */
  FULL_REST_SLEEP_HOURS: 8,
  /** Below this, capacity is meaningfully reduced. */
  MIN_FUNCTIONAL_SLEEP_HOURS: 5,
  /** Fraction of capacity recoverable through within-day restoration. */
  MAX_RESTORATION_RECOVERY: 0.35,
  /** How many restoration minutes recover one capacity minute. */
  RESTORATION_EXCHANGE_RATE: 3,
} as const;

/** Inverted-U arousal band for complex work. @see CITATIONS.YERKES_DODSON */
export const AROUSAL = {
  SCALE_MIN: 1,
  SCALE_MAX: 10,
  /** Optimal band (inclusive) for hard cognitive work — moderate arousal. */
  OPTIMAL_LOW: 4,
  OPTIMAL_HIGH: 7,
} as const;

/** Habit formation & streak grace. @see CITATIONS.HABIT_FORMATION, WHAT_THE_HELL */
export const HABIT = {
  /** Median days to behavioural automaticity. */
  AUTOMATICITY_DAYS: 66,
  /** Missed days forgiven before a streak truly breaks (anti "what-the-hell"). */
  GRACE_TOKENS: 1,
} as const;

/** Peak-end weighting for remembered session quality. @see CITATIONS.PEAK_END */
export const PEAK_END = {
  PEAK_WEIGHT: 0.4,
  END_WEIGHT: 0.4,
  MEAN_WEIGHT: 0.2,
} as const;
