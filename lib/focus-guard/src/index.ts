/**
 * @workspace/focus-guard
 *
 * An epistemic-integrity guardrail for scientific discourse. Given a paper's
 * focus anchor (its central claim and key constructs), Focus Guard evaluates
 * each review and comment for topical drift and cognitive bias, then returns an
 * autonomy-supportive nudge — it never blocks or deletes.
 *
 * Pipeline:  deriveAnchor(paper) → evaluate(contribution, anchor) → FocusReport
 *            aggregateHealth(reports) → FocusHealth (thread level)
 *
 * The engine is deterministic and dependency-free at its core (zod only for
 * boundary validation), with explicit hooks (EvidenceOverrides) for an optional
 * model-assisted pass. See docs/focus-guard/ for design and psychology notes.
 */

export * from "./types";
export { BIAS_REGISTRY, BIAS_DEFINITIONS, type BiasDefinition } from "./biases";
export {
  deriveAnchor,
  type PaperLike,
  type DeriveAnchorOptions,
} from "./anchor";
export { measureDrift, anchorStems, type DriftMeasure } from "./drift";
export {
  detectSignals,
  scoreEngagement,
  type EvidenceOverrides,
} from "./detect";
export { buildNudge } from "./nudge";
export { evaluate, DRIFT_THRESHOLDS, type EvaluateOptions } from "./guard";
export { aggregateHealth, HEALTH_BANDS } from "./health";
