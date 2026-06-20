/**
 * Focus Guard — psychological constants.
 *
 * Every number here is a deliberate design decision grounded in attention and
 * decision-making research, not a magic value. Citations are given so a future
 * maintainer (or skeptic) can audit, challenge, and tune them. They are
 * defaults; users can override the user-tunable ones via their settings.
 *
 * The throughline: peer review is a System-2 task (Kahneman, 2011) performed by
 * finite, fatigue-prone humans. Focus Guard's job is to keep judgement inside
 * the window where it is actually reliable.
 */

/**
 * Basic Rest–Activity Cycle. Kleitman's hypothesis that human alertness and
 * cognitive performance oscillate on a ~90-minute ultradian rhythm during
 * wakefulness, not just sleep.
 *   Kleitman, N. (1963). *Sleep and Wakefulness.*
 *   Refs: ultradian performance rhythms (~80–120 min). We use 90 as the
 *   canonical centre and treat the last ~15 min of each cycle as a "trough".
 */
export const ULTRADIAN_CYCLE_MIN = 90;
export const ULTRADIAN_TROUGH_MIN = 15; // last stretch of a cycle: alertness dips
export const ULTRADIAN_PEAK_START_MIN = 20; // warm-up before peak engagement

/**
 * Attention Restoration Theory: directed attention is a depletable resource,
 * restored by breaks (ideally with "soft fascination", e.g. nature/rest).
 *   Kaplan, S. (1995). The restorative benefits of nature: Toward an
 *   integrative framework. *Journal of Environmental Psychology.*
 * A short restorative break is meaningfully effective; we count >= 3 min.
 */
export const RESTORATIVE_BREAK_MIN = 3;
export const BREAK_RESETS_FATIGUE_MIN = 5;

/**
 * Decision fatigue / the "hungry judge" effect: the quality and even the
 * direction of repeated judgements degrades over an unbroken run of decisions,
 * and recovers sharply after a break.
 *   Danziger, S., Levav, J., & Avnaim-Pesso, L. (2011). Extraneous factors in
 *   judicial decisions. *PNAS, 108(17), 6889–6892.*
 * Their favorable-ruling rate fell across each session and reset after meal
 * breaks. We treat 5 consecutive reviews without a break as the point where a
 * reviewer should be nudged to pause.
 */
export const DECISION_FATIGUE_REVIEW_LIMIT = 5;
export const DECISION_FATIGUE_WARN_AT = 3;

/**
 * Minimum engaged time before a review is "earned". Drive-by reviewing is a
 * cognitive-miser shortcut (Fiske & Taylor): cheap System-1 verdicts dressed up
 * as deliberation. A floor of engaged time forces at least minimal System-2
 * processing. 90s is a conservative default for a full paper page; tunable.
 */
export const MIN_REVIEW_ENGAGEMENT_SEC = 90;

/**
 * Scroll coverage expectation. You cannot fairly judge what you did not read.
 * We expect a reviewer to have traversed most of the document; below this we
 * flag the judgement as under-informed. 0.7 = 70% of the document seen.
 */
export const MIN_REVIEW_SCROLL_DEPTH = 0.7;

/**
 * Idle detection: no input (scroll, mouse, key, visibility) for this long means
 * the clock stops counting "active" time. Keeps activeMs honest.
 */
export const IDLE_THRESHOLD_SEC = 30;

/**
 * Focus score weighting. The end-of-session 0..100 score blends:
 *  - engagement ratio (active / total) — were you actually here?
 *  - dwell adequacy (active vs. an intent-specific target) — long enough?
 *  - scroll coverage — did you traverse the material?
 *  - distraction penalty — how fragmented was the attention?
 * Weights sum to 1 across the positive components; distraction is subtractive.
 */
export const FOCUS_WEIGHTS = {
  engagementRatio: 0.35,
  dwellAdequacy: 0.3,
  scrollCoverage: 0.35,
} as const;

/** Each context-switch (tab blur) costs this many focus points, capped. */
export const DISTRACTION_PENALTY_PER_EVENT = 4;
export const DISTRACTION_PENALTY_CAP = 30;

/**
 * Intent-specific dwell targets (seconds of *active* time) at which dwell is
 * considered fully adequate. Reviewing demands more sustained attention than a
 * skim. Reading sits between.
 */
export const DWELL_TARGET_SEC: Record<"read" | "review" | "skim", number> = {
  skim: 30,
  read: 120,
  review: 240,
};

/**
 * Community-score weighting by focus quality. A review backed by deep focus
 * counts a little more than a drive-by one, but never zero (we never fully
 * silence a voice) and never more than a modest boost (we never let focus
 * theatre dominate the substance of the argument).
 */
export const REVIEW_WEIGHT_MIN = 0.5;
export const REVIEW_WEIGHT_MAX = 1.25;

/** Flow channel (Csikszentmihalyi): high focus sustained over real dwell. */
export const FLOW_FOCUS_SCORE = 80;
export const FLOW_MIN_ACTIVE_SEC = 180;
