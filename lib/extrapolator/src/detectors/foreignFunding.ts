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

// Author-resolution context. A common name (e.g. resolved "name-only" with low
// confidence and no grant-linked papers) may conflate MANY different researchers into
// one profile, so the foreign-support evidence can't be trusted to belong to one
// person. Identity must anchor the signal before corroboration means anything.
export interface IdentityContext {
  confidence: number; // 0..1 author-resolution confidence
  method: string; // e.g. "name-only", "orcid", "grant-anchored"
  grantLinkedPmids: number; // # PMIDs NIH links to this PI's grants (a hard identity anchor)
}

// Cap applied when we are not confident the evidence belongs to ONE real person.
export const IDENTITY_UNCONFIRMED_CAP = 20;

/** Confirmed if reasonably confident AND anchored by >=1 NIH grant-linked paper. */
export function isIdentityConfirmed(id: IdentityContext): boolean {
  return id.confidence >= 0.5 && id.grantLinkedPmids >= 1;
}

export interface ForeignFundingSignal extends DetectorSignal {
  evidence: ConcurrentEvidence[];
  corroboration: Corroboration;
  identityConfirmed: boolean;
}

export function detectForeignFunding(
  awards: NihAward[],
  rawEvidence: ForeignEvidence[],
  identity?: IdentityContext,
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

  // Identity gate: if we can't confirm the evidence belongs to ONE real person,
  // cap the score hard. A common-name, name-only match must never look like a strong
  // signal, however much "corroboration" a conflated profile appears to show.
  const identityConfirmed = identity == null ? true : isIdentityConfirmed(identity);
  if (fired && !identityConfirmed) {
    score = Math.min(score, IDENTITY_UNCONFIRMED_CAP);
  }

  const awardsHit = [...new Set(concurrent.map((e) => e.concurrentWithAward))];
  const identityNote =
    fired && !identityConfirmed && identity != null
      ? ` IDENTITY UNCONFIRMED (match: ${identity.method}, confidence ${identity.confidence.toFixed(2)}, ` +
        `${identity.grantLinkedPmids} grant-linked paper(s)): a common name can merge many different ` +
        `researchers into one profile, so these items may not belong to one person. Confirm the ` +
        `individual (ORCID / grant-linked papers) before treating this as a lead.`
      : "";
  const reason = fired
    ? `${items} foreign-support item(s)` +
      (countries.length ? ` (origin: ${countries.join(", ")})` : "") +
      ` concurrent with NIH award(s) ${awardsHit.join(", ")}, corroborated by ` +
      `${sourceTypes} source-type(s) across ${distinctEntities} distinct entit(y|ies). ` +
      `${corroborated ? "Corroborated" : "Single/uncorroborated — likely benign, low priority"}. ` +
      `Country is not a risk factor (NIH requires disclosing all foreign support); ` +
      `disclosure status unverifiable from public record — probable cause for review, not proof.` +
      identityNote
    : "No foreign support concurrent with an NIH award.";

  return {
    kind: FOREIGN_FUNDING_KIND,
    detector: DETECTOR,
    fired,
    score,
    reason,
    evidence,
    corroboration: { items, sourceTypes, distinctEntities, countries, corroborated },
    identityConfirmed,
  };
}
