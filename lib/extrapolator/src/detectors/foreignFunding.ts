// Pipeline B — undisclosed foreign-funding mismatch.
//
// Logic: foreign (non-US) support that is *concurrent* with an NIH award window may be
// support NIH disclosure rules require. The decisive omission lives on the non-public
// "Other Support" page, so this asserts PROBABLE CAUSE, not fraud.
//
// COUNTRY-NEUTRAL BY DESIGN. Nationality/origin is NEVER a scoring factor. The NIH duty
// is to disclose ALL foreign support regardless of country, so a signal's strength comes
// from CORROBORATION — how many independent public sources and source-types agree — not
// from which country is involved. A lone, uncorroborated foreign affiliation is common
// and benign, so it scores low and is flagged "needs corroboration."
import type { SignalKind } from "@workspace/db/schema";
import type { ForeignEvidence, NihAward } from "../extract";
import type { DetectorSignal } from "./base";

export const FOREIGN_FUNDING_KIND: SignalKind = "foreign_funding_mismatch";
const DETECTOR = "foreign-funding/v2";

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

export interface Corroboration {
  items: number; // concurrent foreign-support items
  sourceTypes: number; // distinct evidence types (affiliation, funder, ...)
  distinctEntities: number; // distinct foreign institutions/funders
  countries: string[]; // factual, NOT a risk input
  corroborated: boolean; // >=2 independent items OR >=2 source-types
}

export interface ForeignFundingSignal extends DetectorSignal {
  evidence: ConcurrentEvidence[];
  corroboration: Corroboration;
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

  const items = concurrent.length;
  const sourceTypes = new Set(concurrent.map((e) => e.type)).size;
  const distinctEntities = new Set(concurrent.map((e) => e.label.trim().toLowerCase())).size;
  const countries = [...new Set(concurrent.map((e) => e.country.toUpperCase()))];
  const corroborated = items >= 2 || sourceTypes >= 2;

  // Score = corroboration only. No country/nationality term anywhere.
  let score = 0;
  if (fired) {
    score = 20; // a single concurrent item: real but weak
    score += Math.min(20, 10 * sourceTypes); // independent source-TYPES agreeing
    score += Math.min(24, 8 * (items - 1)); // volume of corroborating items
    score += Math.min(16, 8 * (distinctEntities - 1)); // distinct foreign entities
    score = Math.min(100, score);
  }

  const awardsHit = [...new Set(concurrent.map((e) => e.concurrentWithAward))];
  const reason = fired
    ? `${items} foreign-support item(s)` +
      (countries.length ? ` (origin: ${countries.join(", ")})` : "") +
      ` concurrent with NIH award(s) ${awardsHit.join(", ")}, corroborated by ` +
      `${sourceTypes} source-type(s) across ${distinctEntities} distinct entit(y|ies). ` +
      `${corroborated ? "Corroborated" : "Single/uncorroborated — likely benign, low priority"}. ` +
      `Country is not a risk factor (NIH requires disclosing all foreign support); ` +
      `disclosure status unverifiable from public record — probable cause for review, not proof.`
    : "No foreign support concurrent with an NIH award.";

  return {
    kind: FOREIGN_FUNDING_KIND,
    detector: DETECTOR,
    fired,
    score,
    reason,
    evidence,
    corroboration: { items, sourceTypes, distinctEntities, countries, corroborated },
  };
}
