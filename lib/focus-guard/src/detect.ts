import type { Contribution, FocusSignal, SignalCode } from "./types";
import { BIAS_DEFINITIONS, BIAS_REGISTRY } from "./biases";
import {
  collectMatches,
  countMatches,
  EVIDENCE_MARKERS,
  HEDGING_MARKERS,
  sentenceCount,
  uppercaseRatio,
} from "./lexicon";

/**
 * Hooks for an optional model-assisted pass. The deterministic detector is the
 * floor; an LLM augmenter can supply higher-recall signals or correct the
 * lexical detector via these overrides. Everything downstream is agnostic to
 * where a signal came from.
 */
export interface EvidenceOverrides {
  /** Force these signals to be included (model-detected). */
  add?: FocusSignal[];
  /** Suppress these codes (model judged them false positives). */
  suppress?: SignalCode[];
}

/**
 * Confidence as a saturating function of how many distinct markers fired.
 * One marker is suggestive (0.55); two is fairly sure; three+ approaches 0.9.
 * We never claim certainty from lexical evidence alone.
 */
function confidenceFromHits(hits: number): number {
  if (hits <= 0) return 0;
  return Math.min(0.9, 0.4 + hits * 0.18);
}

/**
 * Run the deterministic detector over a contribution.
 *
 * High precision is favoured over recall: a false nudge is worse than a missed
 * one because it trains users to dismiss the system (cf. alarm fatigue).
 */
export function detectSignals(
  contribution: Contribution,
  overrides: EvidenceOverrides = {},
): FocusSignal[] {
  const text = contribution.text;
  const evidenceHits = countMatches(text, EVIDENCE_MARKERS);
  const suppress = new Set(overrides.suppress ?? []);
  const signals: FocusSignal[] = [];

  for (const def of BIAS_DEFINITIONS) {
    if (suppress.has(def.code)) continue;

    const evidence = collectMatches(text, def.markers);
    if (evidence.length === 0) continue;

    // Non-specific critique is only a problem when it is *also* unsupported:
    // "weak because n=12" is specific. Suppress vagueness when the contributor
    // actually grounded the judgement.
    if (def.code === "vagueness" && evidenceHits > 0) continue;

    let severity = def.baseSeverity;
    const hits = evidence.length;

    // Repetition intensifies: more distinct markers => stronger pattern.
    severity = Math.min(1, severity + (hits - 1) * 0.1);

    // Affect scales with shouting and exclamation density.
    if (def.code === "hostility") {
      const shout = uppercaseRatio(text);
      const bangDensity = (text.match(/!/g)?.length ?? 0) / sentenceCount(text);
      severity = Math.min(
        1,
        severity + (shout > 0.3 ? 0.2 : 0) + (bangDensity > 1 ? 0.15 : 0),
      );
    }

    // Stance amplification: a "reject" laced with ad hominem is worse than an
    // off-hand comment with the same words.
    if (
      def.riskyWithStance &&
      contribution.stance &&
      def.riskyWithStance.includes(contribution.stance)
    ) {
      severity = Math.min(1, severity + 0.1);
    }

    signals.push({
      code: def.code,
      family: def.family,
      severity: round2(severity),
      confidence: round2(confidenceFromHits(hits)),
      evidence,
    });
  }

  if (overrides.add) {
    for (const s of overrides.add) {
      if (!suppress.has(s.code)) signals.push(s);
    }
  }

  // Strongest first; ties broken by confidence.
  signals.sort(
    (a, b) =>
      b.severity * b.confidence - a.severity * a.confidence ||
      b.confidence - a.confidence,
  );
  return signals;
}

/**
 * Substance score in 0..1: does the contribution do epistemic work?
 *
 * Rewards reasoning connectives and quantitative/citation evidence; gives a
 * small credit for calibrated hedging; penalises pure assertion. Normalised by
 * length so a short, dense comment isn't punished for brevity.
 */
export function scoreEngagement(text: string): number {
  const sents = sentenceCount(text);
  const evidence = countMatches(text, EVIDENCE_MARKERS);
  const hedging = countMatches(text, HEDGING_MARKERS);
  const words = text.trim().split(/\s+/).filter(Boolean).length;

  if (words < 4) return 0.1; // "Great paper!" — pleasant, not substantive.

  const evidenceDensity = Math.min(1, evidence / sents);
  const hedgeBonus = Math.min(0.15, hedging * 0.05);
  const lengthFloor = Math.min(0.3, words / 120); // some credit for elaboration

  return round2(Math.min(1, 0.55 * evidenceDensity + hedgeBonus + lengthFloor));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
