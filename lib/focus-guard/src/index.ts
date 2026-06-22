/**
 * @workspace/focus-guard
 *
 * A pure, deterministic engine that protects deep scientific work by sizing
 * sessions, defending attention from interruptions, and pacing the day — all
 * grounded in (and traceable to) the psychology of attention and motivation.
 *
 * The engine has no I/O and no framework dependencies: feed it a FocusContext,
 * get back plans and verdicts. Persistence lives in @workspace/db
 * (lib/db/src/schema/focus*.ts); this package is the brain, not the memory.
 *
 * Start here:
 *   - buildFocusPlan(ctx)            → a full, ready-to-act session plan
 *   - evaluateInterruption(s, i)     → the guard's verdict on an interruption
 *   - scoreSession(input)            → peak-end weighted session quality
 *   - assessStreak(history)          → habit strength with grace
 */

export const FOCUS_GUARD_VERSION = "0.1.0";

// Knowledge base
export { CITATIONS } from "./constants";
export type { Citation } from "./constants";
export * as constants from "./constants";

// Sub-models
export { assessFlow, flowProximity } from "./flow";
export { alertnessAt, isPeakWindow, circadianLabel } from "./circadian";
export { recommendSession } from "./ultradian";
export { assessResidue } from "./attentionResidue";
export { recommendBreak } from "./restoration";
export { assessBudget } from "./focusBudget";
export { validateIntention, formatIntention } from "./intentions";
export type { IntentionValidation } from "./intentions";
export {
  evaluateInterruption,
  sessionPhase,
} from "./interruptionPolicy";
export type {
  SessionState,
  IncomingInterruption,
} from "./interruptionPolicy";
export { scoreSession } from "./score";
export { assessStreak } from "./streaks";

// Orchestrator
export { buildFocusPlan } from "./recommend";

// Types
export type * from "./types";

// Math (handy for callers shaping their own inputs)
export { clamp, clamp01, round } from "./math";
