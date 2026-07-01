// Pipeline B — undisclosed foreign-funding mismatch.
//
// Logic (unit-tested): foreign support (affiliation or funder) that is *concurrent*
// with an NIH award window suggests support NIH disclosure rules would cover. The
// decisive omission lives on the non-public "Other Support" page, so this asserts
// PROBABLE CAUSE ("disclosure status unverifiable from public record"), not fraud.
import type { SignalKind } from "@workspace/db/schema";
import type { ForeignEvidence, NihAward } from "../extract";
import type { DetectorSignal } from "./base";

export const FOREIGN_FUNDING_KIND: SignalKind = "foreign_funding_mismatch";
const DETECTOR = "foreign-funding/v1";

// NIH "foreign influence" enforcement has concentrated on these; a hit raises confidence.
const HIGH_RISK_COUNTRIES = new Set(["CN", "RU", "IR"]);

export type ConcurrentEvidence = ForeignEvidence & { concurrentWithAward: string | null };

export function concurrentAward(
  workYear: number | null,
  awards: NihAward[],
  graceYears = 1,
): string | null {
  if (workYear == null) return null;
  for (const a of awards) {
    if (a.startYear == null || a.endYear == null) continue;
    if (workYear >= a.startYear - graceYears && workYear <= a.endYear + graceYears) {
      return a.coreProjectNum;
    }
  }
  return null;
}

export interface ForeignFundingSignal extends DetectorSignal {
  evidence: ConcurrentEvidence[];
  matchConfidence: number;
}

export interface DetectOpts {
  // 0..1 certainty that the works/affiliations belong to the intended PI.
  // Below this gate the signal is suppressed as an identity false-positive.
  matchConfidence?: number;
  gate?: number;
}

// Collapse duplicate evidence: OpenAlex repeats the same affiliation across dozens
// of papers, which previously let raw volume alone pin the score to 100. A signal
// is about distinct facts (country+institution+award), not how many rows repeat them.
function dedupeKey(e: ConcurrentEvidence): string {
  return `${e.type}|${e.country}|${e.label}|${e.concurrentWithAward}`;
}

export function detectForeignFunding(
  awards: NihAward[],
  rawEvidence: ForeignEvidence[],
  opts: DetectOpts = {},
): ForeignFundingSignal {
  const matchConfidence = opts.matchConfidence ?? 1;
  const gate = opts.gate ?? 0.4;

  const evidence: ConcurrentEvidence[] = rawEvidence.map((e) => ({
    ...e,
    concurrentWithAward: concurrentAward(e.workYear, awards),
  }));
  const concurrent = evidence.filter((e) => e.concurrentWithAward !== null);

  // Distinct facts, preferring the grant-linked instance of each.
  const byKey = new Map<string, ConcurrentEvidence>();
  for (const e of concurrent) {
    const k = dedupeKey(e);
    const prev = byKey.get(k);
    if (!prev || (e.grantLinked && !prev.grantLinked)) byKey.set(k, e);
  }
  const distinct = [...byKey.values()];
  const linked = distinct.filter((e) => e.grantLinked);

  const identityOk = matchConfidence >= gate;
  const fired = distinct.length > 0 && awards.length > 0 && identityOk;

  const countries = new Set(distinct.map((e) => e.country.toUpperCase()));
  const highRisk = [...countries].some((c) => HIGH_RISK_COUNTRIES.has(c));
  let score = 0;
  if (fired) {
    // Bounded by DISTINCT facts and grant linkage, then scaled by identity certainty,
    // so a merged/ambiguous identity can never produce a high-confidence signal.
    const raw =
      20 +
      10 * Math.min(distinct.length, 6) +
      15 * Math.min(linked.length, 4) +
      10 * (countries.size - 1) +
      (highRisk ? 15 : 0);
    score = Math.round(Math.min(100, raw) * matchConfidence);
  }

  const awardsHit = [...new Set(distinct.map((e) => e.concurrentWithAward))];
  let reason: string;
  if (!identityOk) {
    reason =
      `Identity unresolved (match confidence ${matchConfidence.toFixed(2)} < ${gate}); ` +
      `signal suppressed to avoid an identity false-positive.`;
  } else if (fired) {
    const linkNote = linked.length
      ? `${linked.length} on paper(s) NIH links to the grant(s)`
      : `none grant-linked (temporal overlap only)`;
    reason =
      `${distinct.length} distinct foreign-support fact(s) from ${[...countries].join(", ")} ` +
      `concurrent with NIH award(s) ${awardsHit.join(", ")} (${linkNote}); ` +
      `disclosure status unverifiable from public record.`;
  } else {
    reason = "No foreign support concurrent with an NIH award.";
  }

  return { kind: FOREIGN_FUNDING_KIND, detector: DETECTOR, fired, score, reason, evidence, matchConfidence };
}
