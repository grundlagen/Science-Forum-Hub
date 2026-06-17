/**
 * @workspace/focus-guard
 *
 * A reviewer attention-integrity engine for SciVet. Focus Guard protects the
 * quality of peer review by guarding the one thing review depends on and the
 * platform cannot manufacture: a clear, independent, well-rested mind.
 *
 * The engine is pure and deterministic — no clock, database or I/O. Persistence
 * lives in `@workspace/db` (focus_sessions, focus_events); this package turns a
 * snapshot of that state into an actionable assessment. See FOCUS_GUARD.md.
 */
export * from "./types";
export * from "./constants";
export * from "./engine";
export { selfCheck } from "./selfCheck";
export type { SelfCheckResult } from "./selfCheck";
