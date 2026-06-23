import type { FocusAnchor } from "./types";
import { stem, stemTokens, tokenize } from "./lexicon";

/** Decomposed topical-overlap measurement between a contribution and anchor. */
export interface DriftMeasure {
  /** 0 = fully on-anchor, 1 = no topical overlap at all. */
  topicalDrift: number;
  /** Fraction of the contribution's content tokens that land on the anchor. */
  coverage: number;
  /** Fraction of distinct anchor terms the contribution engages. */
  anchorRecall: number;
  /** Number of content tokens in the contribution (drives confidence). */
  tokenCount: number;
}

/** Build the set of stems that constitute "on-anchor" vocabulary. */
export function anchorStems(anchor: FocusAnchor): Set<string> {
  const set = new Set<string>();
  for (const term of anchor.keyTerms) {
    for (const tok of tokenize(term)) set.add(stem(tok));
  }
  for (const tok of tokenize(anchor.centralClaim)) set.add(stem(tok));
  for (const topic of anchor.inScope) {
    for (const tok of tokenize(topic)) set.add(stem(tok));
  }
  return set;
}

/**
 * Measure topical drift via asymmetric overlap.
 *
 * `coverage` answers "is what they wrote about *this* paper?" and is the
 * primary signal — it is robust to anchor size. `anchorRecall` answers "did
 * they engage the paper's key constructs?" and provides a smaller pull so that
 * a contribution touching several distinct anchor terms is rewarded.
 *
 * Empty / contentless contributions are maximally drifted, but callers should
 * treat that as *low confidence* (see {@link DriftMeasure.tokenCount}).
 */
export function measureDrift(text: string, anchor: FocusAnchor): DriftMeasure {
  const anchorSet = anchorStems(anchor);
  const contribStems = stemTokens(text);
  const tokenCount = contribStems.length;

  if (tokenCount === 0 || anchorSet.size === 0) {
    return { topicalDrift: 1, coverage: 0, anchorRecall: 0, tokenCount };
  }

  let onAnchor = 0;
  const touched = new Set<string>();
  for (const s of contribStems) {
    if (anchorSet.has(s)) {
      onAnchor += 1;
      touched.add(s);
    }
  }

  const coverage = onAnchor / tokenCount;
  const anchorRecall = touched.size / anchorSet.size;

  // Blend, then dampen: even fully on-topic prose rarely exceeds ~0.5 coverage
  // because of connective words, so we scale coverage into a usable range.
  const onAnchorScore = Math.min(1, coverage * 1.8 + anchorRecall * 0.6);
  const topicalDrift = clamp01(1 - onAnchorScore);

  return { topicalDrift, coverage, anchorRecall, tokenCount };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
