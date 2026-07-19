import type { MatchClass } from "./types";

/** Per-class base weight. Transformed cross-figure reuse is the strongest signal. */
const CLASS_WEIGHT: Record<MatchClass, number> = {
  transformed: 1.0,
  near_dup: 0.75,
  copy_move: 0.7,
  splice: 0.6,
};

export type RankableMatch = {
  matchClass: MatchClass;
  similarity: number; // 0..1
  blotLike: boolean;
  /** True when this match co-occurs with other independent matches on the paper. */
  corroborated?: boolean;
};

export type SuspicionResult = {
  score: number;
  matchCount: number;
  breakdown: { transformed: number; near_dup: number; copy_move: number; splice: number };
  topClass: MatchClass | null;
};

/**
 * Aggregate a paper's matches into a single suspicion score used to rank the
 * triage queue ("zeroing in on likely candidates"). Diminishing returns on
 * volume; blot-only matches without corroboration are discounted for their
 * false-positive tendency; a cluster of independent matches is boosted.
 * See docs/DUPLICATION_DETECTION_ONESHOT.md §4.
 */
export function suspicionScore(matches: RankableMatch[]): SuspicionResult {
  const breakdown = { transformed: 0, near_dup: 0, copy_move: 0, splice: 0 };
  let raw = 0;
  let topClass: MatchClass | null = null;
  let topContribution = 0;

  // Strongest matches first so diminishing returns reward the best evidence.
  const sorted = [...matches].sort(
    (m1, m2) => CLASS_WEIGHT[m2.matchClass] * m2.similarity - CLASS_WEIGHT[m1.matchClass] * m1.similarity,
  );

  sorted.forEach((m, i) => {
    breakdown[m.matchClass] += 1;
    let contribution = CLASS_WEIGHT[m.matchClass] * m.similarity;
    // Discount uncorroborated blot matches (high FP surface).
    if (m.blotLike && !m.corroborated) contribution *= 0.5;
    // Diminishing returns on the nth match.
    contribution *= 1 / (1 + i * 0.35);
    raw += contribution;
    if (contribution > topContribution) {
      topContribution = contribution;
      topClass = m.matchClass;
    }
  });

  // Cluster boost: several independent matches raise the prior.
  const distinctSignals = matches.filter((m) => !m.blotLike || m.corroborated).length;
  if (distinctSignals >= 3) raw *= 1.25;

  // Squash to 0..100 for a stable, comparable queue key.
  const score = Math.round(100 * (1 - Math.exp(-raw)) * 100) / 100;
  return { score, matchCount: matches.length, breakdown, topClass };
}
