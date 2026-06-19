/**
 * @workspace/focus-engine
 *
 * The pure, dependency-free brain of Focus Guard — a deep-work companion for
 * the Science Forum Hub. Every function here is deterministic and side-effect
 * free so it can run identically on the server (scoring a finished session) and
 * in the browser (live intention feedback as you type, a ticking break timer).
 *
 * Nothing in this package talks to a database, a clock, or a network. Callers
 * pass in the facts; the engine returns judgement and copy. That keeps the
 * psychology testable and auditable in one place.
 */

export * from "./types";
export * from "./techniques";
export * from "./intention";
export * from "./scoring";
export * from "./streaks";
export * from "./reflection";
