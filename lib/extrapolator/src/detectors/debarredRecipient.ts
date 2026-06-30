// General-funding detector: federal awards flowing to SAM-excluded (debarred) parties.
// A textbook FCA signal across any domain (healthcare, defense, grants, etc.).
//
// Pure logic over already-fetched awards (USASpending) + an exclusion index (SAM.gov).
// Output is probable cause for review — identity and dates must be human-verified.
import type { SignalKind, FraudDomain } from "@workspace/db/schema";
import type { AwardRecord } from "@workspace/integration-usaspending";
import {
  normalizeName,
  type ExclusionIndex,
  type ExclusionRecord,
} from "@workspace/integration-sam-exclusions";
import type { DetectorSignal } from "./base";

const KIND: SignalKind = "debarred_recipient";
const DOMAIN: FraudDomain = "general_federal_award";
const DETECTOR = "debarred-recipient/v1";

function parseDate(d: string | null): number | null {
  if (!d) return null;
  const t = Date.parse(d);
  return Number.isNaN(t) ? null : t;
}

/** Was the exclusion active when the award started? Indefinite/blank termination = open. */
export function activeAtAward(award: AwardRecord, excl: ExclusionRecord): boolean {
  const awardT = parseDate(award.startDate);
  const activeT = parseDate(excl.activationDate);
  if (awardT == null || activeT == null) return false;
  if (awardT < activeT) return false;
  const termRaw = (excl.terminationDate ?? "").trim().toLowerCase();
  if (termRaw === "" || termRaw === "indefinite") return true;
  const termT = parseDate(excl.terminationDate);
  return termT == null ? true : awardT <= termT;
}

export interface DebarredMatch {
  award: AwardRecord;
  exclusion: ExclusionRecord;
  matchType: "uei" | "name";
  activeAtAward: boolean;
}

export function matchDebarred(awards: AwardRecord[], index: ExclusionIndex): DebarredMatch[] {
  const matches: DebarredMatch[] = [];
  for (const a of awards) {
    if (!a.recipientName) continue;
    const nk = normalizeName(a.recipientName);
    const hits = nk ? index.byName.get(nk) : undefined;
    if (!hits || hits.length === 0) continue;
    const excl = hits[0];
    matches.push({ award: a, exclusion: excl, matchType: "name", activeAtAward: activeAtAward(a, excl) });
  }
  return matches;
}

export function detectDebarredRecipients(
  awards: AwardRecord[],
  index: ExclusionIndex,
): { signals: DetectorSignal[]; matches: DebarredMatch[] } {
  const matches = matchDebarred(awards, index);
  const signals: DetectorSignal[] = matches.map((m) => {
    let score = m.matchType === "uei" ? 70 : 45; // name matches need human identity confirmation
    if (m.activeAtAward) score += 25;
    if ((m.award.amount ?? 0) > 1_000_000) score += 5;
    score = Math.min(100, score);
    const amount = m.award.amount != null ? `$${m.award.amount.toLocaleString()}` : "unknown amount";
    return {
      kind: KIND,
      detector: DETECTOR,
      fired: true,
      score,
      domain: DOMAIN,
      subjectName: m.award.recipientName ?? undefined,
      reason:
        `Federal award ${m.award.awardId ?? "?"} (${amount}, ${m.award.awardingAgency ?? "agency ?"}) to ` +
        `"${m.award.recipientName}" matches a SAM exclusion (${m.exclusion.exclusionType ?? "debarred"})` +
        `${m.activeAtAward ? ", active at the award start date" : ""}. ` +
        `Name-based match — confirm identity (UEI) and dates before any action.`,
      evidence: {
        award: m.award,
        exclusion: m.exclusion,
        matchType: m.matchType,
        activeAtAward: m.activeAtAward,
      },
    };
  });
  return { signals, matches };
}
