// Cross-source reasoning layer. A single detector firing on one subject is a lead, not
// a case. This aggregates ALL signals about one subject across detectors/domains and
// reasons: independent detectors agreeing raises confidence; a lone signal is capped and
// flagged "seek corroboration." This is the "check multiple sources and reason" step —
// deliberately conservative so we don't escalate on one thin, possibly-benign signal.
import type { DetectorSignal } from "./detectors/base";

export interface CorroboratedFinding {
  subject: string;
  signals: DetectorSignal[];
  distinctDetectors: number;
  distinctDomains: number;
  maxSignal: number;
  combinedConfidence: number; // 0..100
  corroborated: boolean; // >= 2 independent detectors agree
  recommendation: string;
}

const SINGLE_SOURCE_CAP = 60; // one detector alone can't exceed this, no matter its raw score

export function corroborate(subject: string, signals: DetectorSignal[]): CorroboratedFinding {
  const fired = signals.filter((s) => s.fired);
  const detectors = new Set(fired.map((s) => s.detector));
  const domains = new Set(fired.map((s) => s.domain ?? "unknown"));
  const maxSignal = fired.reduce((m, s) => Math.max(m, s.score), 0);
  const distinctDetectors = detectors.size;

  let combined = maxSignal;
  if (distinctDetectors >= 2) {
    // independent corroboration: raise toward, but not past, 100
    combined = Math.min(100, maxSignal + 12 * (distinctDetectors - 1) + 6 * (domains.size - 1));
  } else {
    // a single source cannot carry a case on its own
    combined = Math.min(maxSignal, SINGLE_SOURCE_CAP);
  }

  const corroborated = distinctDetectors >= 2;
  const recommendation = !fired.length
    ? "No firing signals."
    : corroborated
      ? `Corroborated by ${distinctDetectors} independent detectors across ${domains.size} domain(s) — strongest candidates for human review.`
      : `Single-source signal (detector: ${[...detectors][0]}). Seek independent corroboration ` +
        `(another dataset/detector, or expert review) before escalating; capped at ${SINGLE_SOURCE_CAP}.`;

  return {
    subject,
    signals: fired,
    distinctDetectors,
    distinctDomains: domains.size,
    maxSignal,
    combinedConfidence: combined,
    corroborated,
    recommendation,
  };
}

/** Group signals by their subject name, then corroborate each subject. */
export function corroborateAll(signals: DetectorSignal[]): CorroboratedFinding[] {
  const bySubject = new Map<string, DetectorSignal[]>();
  for (const s of signals) {
    const key = s.subjectName ?? "(unknown subject)";
    (bySubject.get(key) ?? bySubject.set(key, []).get(key)!).push(s);
  }
  return [...bySubject.entries()]
    .map(([subject, sigs]) => corroborate(subject, sigs))
    .sort((a, b) => b.combinedConfidence - a.combinedConfidence);
}
