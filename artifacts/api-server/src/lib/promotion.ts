export const PROMOTION_THRESHOLDS = {
  underReview: 6.5,
  promoted: 7.5,
  published: 8.0,
};

export type StageInputs = {
  rigorScore: number | null;
  aiConfidence: number | null;
  endorse: number;
  challenge: number;
  reject: number;
};

export function communityScore(endorse: number, challenge: number, reject: number): number {
  const total = endorse + challenge + reject;
  if (total === 0) return 0;
  // 0..10 scale: endorse +10, challenge +4, reject 0
  return ((endorse * 10 + challenge * 4) / total);
}

export function combinedScore(rigor: number | null, ai: number | null, community: number, votes: number): number {
  const rigorPart = rigor ?? 0;
  const confPart = (ai ?? 0) * 10;
  // Weight rigor and AI heavily until community has >=3 votes; then community equal weight
  if (votes < 3) return 0.55 * rigorPart + 0.35 * confPart + 0.1 * community;
  return 0.4 * rigorPart + 0.25 * confPart + 0.35 * community;
}

export function computeStage(inputs: StageInputs): "draft" | "under_review" | "promoted" | "published" {
  const total = inputs.endorse + inputs.challenge + inputs.reject;
  const community = communityScore(inputs.endorse, inputs.challenge, inputs.reject);
  const combined = combinedScore(inputs.rigorScore, inputs.aiConfidence, community, total);

  if (
    combined >= PROMOTION_THRESHOLDS.published &&
    inputs.endorse >= 5 &&
    inputs.endorse > inputs.reject * 2
  ) {
    return "published";
  }
  if (
    combined >= PROMOTION_THRESHOLDS.promoted &&
    total >= 3 &&
    inputs.endorse >= inputs.reject
  ) {
    return "promoted";
  }
  if (
    combined >= PROMOTION_THRESHOLDS.underReview ||
    total >= 1 ||
    (inputs.rigorScore ?? 0) >= PROMOTION_THRESHOLDS.underReview
  ) {
    return "under_review";
  }
  return "draft";
}
