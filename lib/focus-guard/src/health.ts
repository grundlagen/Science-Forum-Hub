import type { FocusHealth, FocusReport, HealthBand, SignalCode } from "./types";

/** Health bands on the 0..100 score. */
export const HEALTH_BANDS = {
  healthy: 70,
  watch: 45,
} as const;

/** Tone signals weigh extra against thread health. */
const TONE_CODES: ReadonlySet<SignalCode> = new Set([
  "hostility",
  "ad_hominem",
]);

/**
 * Aggregate per-contribution reports into a single picture of a thread's
 * epistemic health.
 *
 * The score blends (a) staying on the claim, (b) substance, and (c) on-focus
 * ratio, with an extra penalty for prevalent hostility — a few caustic voices
 * suppress others' participation out of proportion to their count.
 */
export function aggregateHealth(reports: readonly FocusReport[]): FocusHealth {
  const contributions = reports.length;

  if (contributions === 0) {
    return {
      contributions: 0,
      meanDrift: 0,
      onFocusRatio: 1,
      meanEngagement: 0,
      signalHistogram: {},
      healthScore: 100,
      band: "healthy",
      topDistractions: [],
    };
  }

  let driftSum = 0;
  let engagementSum = 0;
  let onFocusCount = 0;
  let toneCount = 0;
  const histogram: Partial<Record<SignalCode, number>> = {};

  for (const r of reports) {
    driftSum += r.driftScore;
    engagementSum += r.engagementScore;
    if (r.onFocus) onFocusCount += 1;
    for (const s of r.signals) {
      histogram[s.code] = (histogram[s.code] ?? 0) + 1;
      if (TONE_CODES.has(s.code)) toneCount += 1;
    }
  }

  const meanDrift = driftSum / contributions;
  const meanEngagement = engagementSum / contributions;
  const onFocusRatio = onFocusCount / contributions;
  const tonePenalty = Math.min(0.3, (toneCount / contributions) * 0.4);

  const raw =
    0.4 * (1 - meanDrift) +
    0.3 * onFocusRatio +
    0.3 * meanEngagement -
    tonePenalty;
  const healthScore = Math.round(clamp01(raw) * 100);

  const topDistractions = (
    Object.entries(histogram) as Array<[SignalCode, number]>
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code]) => code);

  return {
    contributions,
    meanDrift: round2(meanDrift),
    onFocusRatio: round2(onFocusRatio),
    meanEngagement: round2(meanEngagement),
    signalHistogram: histogram,
    healthScore,
    band: bandFor(healthScore),
    topDistractions,
  };
}

function bandFor(score: number): HealthBand {
  if (score >= HEALTH_BANDS.healthy) return "healthy";
  if (score >= HEALTH_BANDS.watch) return "watch";
  return "fragmented";
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
