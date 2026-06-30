// Ethics / proportionality triage. Encodes a deliberate stance: do not auto-escalate
// small entities, individuals, or actors with a plausible public-benefit mission;
// deprioritize low-value cases; prefer human review and (where appropriate) notifying
// the subject before any filing. This is a recommendation layer for a human — it never
// decides anything on its own. Not legal advice.

export type EntityScale = "individual" | "small" | "large" | "unknown";

export type RecommendedAction =
  | "hold_low_value" // recovery too small to justify the disruption
  | "consider_notify_first" // engage / warn the subject before escalating
  | "review" // standard human review
  | "escalate"; // strong, high-value, large-entity case worth pursuing

export interface TriageInput {
  signalScore: number;
  amountUsd?: number | null;
  entityScale?: EntityScale;
  publicBenefitNote?: string | null;
  lowValueThresholdUsd?: number;
}

export interface TriageResult {
  entityScale: EntityScale;
  ethicsFlags: string[];
  recommendedAction: RecommendedAction;
  rationale: string;
}

export function triage(input: TriageInput): TriageResult {
  const scale: EntityScale = input.entityScale ?? "unknown";
  const amount = input.amountUsd ?? null;
  const lowValue = input.lowValueThresholdUsd ?? 150_000;
  const flags: string[] = [];

  if (scale === "small" || scale === "individual") {
    flags.push("Small entity / individual — weigh proportionality; consider notifying before filing.");
  }
  if (input.publicBenefitNote) {
    flags.push(`Claimed public benefit — human review of mission impact required: ${input.publicBenefitNote}`);
  }
  if (amount != null && amount < lowValue) {
    flags.push(`Low recovery (~$${amount.toLocaleString()}) — likely disproportionate to the disruption caused.`);
  }

  let action: RecommendedAction;
  let why: string;
  if (amount != null && amount < lowValue) {
    action = "hold_low_value";
    why = "Estimated recovery is below the low-value threshold; pursuing may do more harm than good.";
  } else if (input.publicBenefitNote) {
    action = "consider_notify_first";
    why = "A plausible public-benefit mission is claimed; engage/verify before escalating.";
  } else if (scale === "individual" || scale === "small") {
    action = "consider_notify_first";
    why = "Small/individual subject; prefer notification and proportionality over immediate escalation.";
  } else if (input.signalScore >= 70 && (amount ?? 0) >= 1_000_000 && scale === "large") {
    action = "escalate";
    why = "High-confidence, high-value signal against a large entity; strongest candidate to pursue.";
  } else {
    action = "review";
    why = "Standard human review: confirm the facts and judge the ethics case-by-case.";
  }

  return { entityScale: scale, ethicsFlags: flags, recommendedAction: action, rationale: why };
}
