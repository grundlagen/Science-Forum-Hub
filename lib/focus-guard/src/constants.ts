/**
 * Focus Guard — psychological parameters.
 *
 * Every constant here encodes a finding from the attention / judgment
 * literature. They are deliberately gathered in one file so the science is
 * auditable and tunable in isolation from the engine math. Citations are given
 * inline; see ../FOCUS_GUARD.md for the long-form rationale.
 *
 * Units: all durations are milliseconds unless the name ends in a different
 * unit. Time-of-day is a fractional hour in [0, 24).
 */

const MINUTE = 60_000;

// ── Reading commitment ──────────────────────────────────────────────────────
//
// People routinely judge and share work they have not actually read. Gabielkov
// et al. (2016) found ~59% of links shared on social media were never opened.
// A verdict on a scientific paper should require demonstrable engagement, not
// mere exposure (Zajonc 1968 — mere-exposure breeds familiarity, not
// comprehension).

/** Adult silent reading speed for prose, words/minute (Brysbaert 2019 meta-analysis: ~238 wpm). */
export const READING_WPM = 238;

/**
 * Fraction of the *estimated* reading time a reviewer must actually dwell
 * before a verdict unlocks. Skim-reading comprehension collapses below roughly
 * half of natural reading time (Duggan & Payne 2009), so we anchor the floor at
 * 0.4 — enough to force genuine contact without demanding a word-perfect read.
 */
export const MIN_READ_FRACTION = 0.4;

/** Scroll/section coverage required before a verdict unlocks (0..1). */
export const MIN_COVERAGE = 0.7;

/** A reviewer can never unlock a verdict in less than this, however short the paper. */
export const MIN_DWELL_MS = 45_000;

/** Nor are they ever required to dwell longer than this, however long the paper. */
export const MAX_REQUIRED_DWELL_MS = 12 * MINUTE;

/** Weighting of dwell vs. coverage in the composite reading-progress meter. */
export const READING_DWELL_WEIGHT = 0.6;
export const READING_COVERAGE_WEIGHT = 0.4;

// ── Decision fatigue ────────────────────────────────────────────────────────
//
// Judgment quality and consistency degrade across a sequence of decisions and
// recover after rest — the "hungry judges" effect (Danziger, Levav &
// Avnaim-Pesso, PNAS 2011) and ego-depletion more broadly (Baumeister et al.
// 1998). Reviewers late in a long sitting are harsher, noisier and more
// anchored on heuristics.

/**
 * Decision-count time constant for the saturating fatigue curve
 * `1 - exp(-reviews / DECISION_TAU)`. Deep peer review is far heavier than the
 * parole rulings in Danziger; we treat ~5 reviews as the point where quantity
 * load is well past its knee.
 */
export const DECISION_TAU = 4;

/** Each break "forgives" this many reviews of accumulated decision load. */
export const REVIEWS_RECOVERED_PER_BREAK = 1.5;

/** Continuous-focus time constant for the time-on-task fatigue curve. */
export const TIME_FATIGUE_TAU_MS = 50 * MINUTE;

/** Relative weights of the three fatigue contributors (normalised in the engine). */
export const FATIGUE_WEIGHT_TIME = 0.4;
export const FATIGUE_WEIGHT_QUANTITY = 0.4;
export const FATIGUE_WEIGHT_CIRCADIAN = 0.2;

/** Band thresholds on the 0..1 fatigue score. */
export const FATIGUE_BANDS = {
  fresh: 0.3,
  steady: 0.55,
  tiring: 0.8,
} as const;

/**
 * Floor on verdict trust. Even a depleted reviewer carries signal, so a verdict
 * cast at maximal fatigue is discounted, never voided.
 */
export const VERDICT_TRUST_FLOOR = 0.4;

// ── Circadian rhythm ────────────────────────────────────────────────────────
//
// Alertness follows a ~24h rhythm with a well-documented early-afternoon
// "post-lunch dip" (Monk 2005) and a deep nocturnal trough (Wesensten et al.
// 2004). Vigilance and error rates worsen sharply in these windows.

/** Centre and shape of the post-lunch dip (fractional hour). */
export const POST_LUNCH_DIP = { center: 14.5, halfWidth: 2.5, depth: 0.35 } as const;

/** The nocturnal trough rises toward this start hour and peaks before dawn. */
export const NOCTURNAL = { start: 22, peak: 4.5, depth: 0.55 } as const;

/** Chronotype shifts both circadian features earlier/later, in hours. */
export const CHRONOTYPE_SHIFT_HOURS = { early: -1.5, neutral: 0, late: 1.5 } as const;

// ── Attention residue ───────────────────────────────────────────────────────
//
// Switching tasks before the previous one is cognitively "closed" leaves
// attention residue that impairs the next task (Leroy 2009). A brief, enforced
// pause between papers turns an abrupt switch into an intentional one.

/** Cooldown after closing a paper before a *new* review may be committed. */
export const RESIDUE_COOLDOWN_MS = 20_000;

// ── Flow & ultradian rhythm ─────────────────────────────────────────────────
//
// Sustained focus runs in ~90-minute ultradian cycles (Kleitman's Basic
// Rest–Activity Cycle); restorative breaks reset attentional resources. Flow
// (Csikszentmihalyi 1990) is fragile — interruptions are costly — so non-urgent
// nudges are suppressed while a reviewer is in flow.

/** Below this continuous-focus time the reviewer is still "warming up". */
export const FLOW_WARMUP_MS = 5 * MINUTE;

/** The ultradian boundary at which a restorative break becomes due. */
export const ULTRADIAN_MS = 90 * MINUTE;

/** Grace window past the boundary before focus is treated as "strained". */
export const STRAIN_GRACE_MS = 15 * MINUTE;
