/**
 * Reading-Commitment Guard — anti-shallow engagement.
 *
 * A verdict stays locked until the reviewer demonstrates genuine contact with
 * the paper: enough dwell time (scaled to the paper's length) and enough
 * coverage (scroll depth). This defends against judging work one has not read
 * (Gabielkov et al. 2016) without demanding a perfect, word-for-word pass.
 */
import {
  MAX_REQUIRED_DWELL_MS,
  MIN_COVERAGE,
  MIN_DWELL_MS,
  MIN_READ_FRACTION,
  READING_COVERAGE_WEIGHT,
  READING_DWELL_WEIGHT,
  READING_WPM,
} from "../constants";
import type { PaperEngagement, ReadingAssessment } from "../types";
import { clamp, round } from "./math";

/** Estimated natural reading time for a body of `wordCount` words. */
export function estimateReadingMs(wordCount: number): number {
  return (Math.max(0, wordCount) / READING_WPM) * 60_000;
}

/** The dwell a reviewer must accrue before the verdict unlocks. */
export function requiredDwellMs(wordCount: number): number {
  const target = estimateReadingMs(wordCount) * MIN_READ_FRACTION;
  return clamp(target, MIN_DWELL_MS, MAX_REQUIRED_DWELL_MS);
}

export function assessReading(
  engagement: PaperEngagement | null,
  enabled: boolean,
): ReadingAssessment {
  if (!engagement) {
    return {
      unlocked: false,
      progress: 0,
      estimatedReadingMs: 0,
      requiredDwellMs: 0,
      dwellMs: 0,
      coverage: 0,
    };
  }

  const estimatedReadingMs = round(estimateReadingMs(engagement.wordCount));
  const required = round(requiredDwellMs(engagement.wordCount));
  const dwellMs = Math.max(0, engagement.dwellMs);
  const coverage = clamp(engagement.scrollCoverage);

  const dwellProgress = clamp(dwellMs / required);
  const coverageProgress = clamp(coverage / MIN_COVERAGE);
  const progress = clamp(
    dwellProgress * READING_DWELL_WEIGHT + coverageProgress * READING_COVERAGE_WEIGHT,
  );

  const unlocked = !enabled || (dwellMs >= required && coverage >= MIN_COVERAGE);

  return {
    unlocked,
    progress: round(progress),
    estimatedReadingMs,
    requiredDwellMs: required,
    dwellMs: round(dwellMs),
    coverage: round(coverage),
  };
}
