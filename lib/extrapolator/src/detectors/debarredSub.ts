// Sub-award detector: a prime contractor/grantee passing federal money to a SAM-excluded
// (debarred) SUB-recipient. Same FCA theory as debarredRecipient, one tier down — and
// often less scrutinised. Pure logic over fetched sub-awards + a SAM exclusion index.
import type { SignalKind, FraudDomain } from "@workspace/db/schema";
import type { SubawardRecord } from "@workspace/integration-usaspending";
import {
  normalizeName,
  type ExclusionIndex,
  type ExclusionRecord,
} from "@workspace/integration-sam-exclusions";
import type { DetectorSignal } from "./base";

const KIND: SignalKind = "debarred_recipient";
const DOMAIN: FraudDomain = "general_federal_award";
const DETECTOR = "debarred-sub/v1";

export interface DebarredSubMatch {
  subaward: SubawardRecord;
  exclusion: ExclusionRecord;
}

export function matchDebarredSubs(
  subawards: SubawardRecord[],
  index: ExclusionIndex,
): DebarredSubMatch[] {
  const matches: DebarredSubMatch[] = [];
  for (const s of subawards) {
    if (!s.subRecipientName) continue;
    const nk = normalizeName(s.subRecipientName);
    const hits = nk ? index.byName.get(nk) : undefined;
    if (hits && hits.length > 0) matches.push({ subaward: s, exclusion: hits[0] });
  }
  return matches;
}

export function detectDebarredSubs(
  subawards: SubawardRecord[],
  index: ExclusionIndex,
): { signals: DetectorSignal[]; matches: DebarredSubMatch[] } {
  const matches = matchDebarredSubs(subawards, index);
  const signals: DetectorSignal[] = matches.map((m) => {
    let score = 45; // name match; confirm identity (UEI)
    if ((m.subaward.amount ?? 0) > 100_000) score += 10;
    score = Math.min(100, score);
    const amt = m.subaward.amount != null ? `$${m.subaward.amount.toLocaleString()}` : "unknown amount";
    return {
      kind: KIND,
      detector: DETECTOR,
      fired: true,
      score,
      domain: DOMAIN,
      subjectName: m.subaward.subRecipientName ?? undefined,
      reason:
        `Sub-award (${amt}) under prime award ${m.subaward.primeAwardId ?? "?"} ` +
        `(prime: ${m.subaward.primeRecipientName ?? "?"}) flows to "${m.subaward.subRecipientName}", ` +
        `which matches a SAM exclusion (${m.exclusion.exclusionType ?? "debarred"}). ` +
        `Name-based match — confirm identity (UEI) and dates before any action.`,
      evidence: { subaward: m.subaward, exclusion: m.exclusion, tier: "sub" },
    };
  });
  return { signals, matches };
}
