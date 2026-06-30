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
}

export function detectForeignFunding(
  awards: NihAward[],
  rawEvidence: ForeignEvidence[],
): ForeignFundingSignal {
  const evidence: ConcurrentEvidence[] = rawEvidence.map((e) => ({
    ...e,
    concurrentWithAward: concurrentAward(e.workYear, awards),
  }));
  const concurrent = evidence.filter((e) => e.concurrentWithAward !== null);
  const fired = concurrent.length > 0 && awards.length > 0;

  const countries = new Set(concurrent.map((e) => e.country.toUpperCase()));
  const highRisk = [...countries].some((c) => HIGH_RISK_COUNTRIES.has(c));
  let score = 0;
  if (fired) {
    score = Math.min(
      100,
      30 + 12 * concurrent.length + 10 * (countries.size - 1) + (highRisk ? 20 : 0),
    );
  }
  const awardsHit = [...new Set(concurrent.map((e) => e.concurrentWithAward))];
  const reason = fired
    ? `${concurrent.length} foreign-support item(s) from ${[...countries].join(", ")} ` +
      `concurrent with NIH award(s) ${awardsHit.join(", ")}; disclosure status ` +
      `unverifiable from public record.`
    : "No foreign support concurrent with an NIH award.";

  return { kind: FOREIGN_FUNDING_KIND, detector: DETECTOR, fired, score, reason, evidence };
}
