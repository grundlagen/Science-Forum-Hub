// Bid-rigging screens over procurement tender data (OCDS or any bid-level source).
// Implements the standard statistical screens from the collusion literature
// (OECD data-screening guidance; Imhof/Huber Swiss cartel screens; ML-screen studies
// that classify ~84-90% of collusive tenders correctly):
//
//   CV screen   — coefficient of variation of bids. Colluders coordinate prices, so
//                 bids cluster abnormally tightly (CV below ~0.05).
//   RD screen   — relative distance = (bid2 - bid1) / stddev(losing bids). Cover bids
//                 are padded above the designated winner, so the gap between the two
//                 lowest bids is large relative to the spread of the losers (RD > 1).
//   Rotation    — the same small set of bidders shares wins round-robin. Measured as
//                 win-share entropy across tenders for a recurring bidder group.
//
// One screen alone is weak (competitive markets can look tight); the detector fires
// on >= 2 concordant screens, consistent with the corroboration layer's philosophy.
// DOJ program mapping: Antitrust Whistleblower / FCA (bid-rigged federal contracts).
import type { SignalKind, FraudDomain } from "@workspace/db/schema";
import type { DetectorSignal } from "./base";

const KIND: SignalKind = "bid_rigging";
const DOMAIN: FraudDomain = "antitrust_bid_rigging";
const DETECTOR = "bid-rigging-screens/v1";

export interface Bid {
  bidder: string;
  amount: number;
}

export interface Tender {
  tenderId: string;
  buyer?: string;
  bids: Bid[];
  winner?: string; // defaults to the lowest bidder
}

export const CV_SUSPICIOUS = 0.05; // bids within ~5% of each other
export const RD_SUSPICIOUS = 1.0; // winner-to-runner-up gap exceeds losing-bid spread

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export interface TenderScreens {
  tenderId: string;
  bidders: number;
  cv: number | null;
  rd: number | null;
  cvSuspicious: boolean;
  rdSuspicious: boolean;
}

/** Compute the per-tender screens. Needs >= 4 bids for both screens to be meaningful. */
export function screenTender(t: Tender): TenderScreens {
  const amounts = t.bids.map((b) => b.amount).filter((a) => Number.isFinite(a) && a > 0);
  const sorted = [...amounts].sort((a, b) => a - b);
  let cv: number | null = null;
  let rd: number | null = null;
  if (sorted.length >= 2) {
    const m = mean(sorted);
    cv = m > 0 ? std(sorted) / m : null;
  }
  // RD needs >= 3 losing bids: with fewer, the losing-bid spread is too unstable
  // and the screen false-positives on ordinary tight tenders.
  if (sorted.length >= 4) {
    const losers = sorted.slice(1);
    const sLosers = std(losers);
    rd = sLosers > 0 ? (sorted[1] - sorted[0]) / sLosers : null;
  }
  return {
    tenderId: t.tenderId,
    bidders: amounts.length,
    cv,
    rd,
    cvSuspicious: cv != null && cv < CV_SUSPICIOUS,
    rdSuspicious: rd != null && rd > RD_SUSPICIOUS,
  };
}

export interface RotationScreen {
  group: string[]; // recurring bidder set (sorted)
  tenders: number;
  winners: Record<string, number>;
  rotationSuspicious: boolean; // wins spread evenly across the group
}

/**
 * Rotation screen across tenders: find bidder groups that meet repeatedly and share
 * wins evenly. Requires >= MIN_GROUP_TENDERS meetings of the same >= 3-bidder set.
 */
export const MIN_GROUP_TENDERS = 4;

export function screenRotation(tenders: Tender[]): RotationScreen[] {
  const byGroup = new Map<string, Tender[]>();
  for (const t of tenders) {
    const set = [...new Set(t.bids.map((b) => b.bidder))].sort();
    if (set.length < 3) continue;
    const k = set.join("|");
    (byGroup.get(k) ?? byGroup.set(k, []).get(k)!).push(t);
  }
  const out: RotationScreen[] = [];
  for (const [k, group] of byGroup) {
    if (group.length < MIN_GROUP_TENDERS) continue;
    const winners: Record<string, number> = {};
    for (const t of group) {
      const w =
        t.winner ??
        [...t.bids].sort((a, b) => a.amount - b.amount)[0]?.bidder;
      if (w) winners[w] = (winners[w] ?? 0) + 1;
    }
    const members = k.split("|");
    const shares = members.map((m) => (winners[m] ?? 0) / group.length);
    // Even sharing: every member wins, and no member dominates. Competitive markets
    // concentrate wins in the most efficient firm; cartels distribute them.
    const everyoneWins = shares.every((s) => s > 0);
    const maxShare = Math.max(...shares);
    out.push({
      group: members,
      tenders: group.length,
      winners,
      rotationSuspicious: everyoneWins && maxShare <= 0.5,
    });
  }
  return out;
}

export function detectBidRigging(subjectName: string, tenders: Tender[]): DetectorSignal {
  const screens = tenders.map(screenTender);
  const rotations = screenRotation(tenders);
  const cvHits = screens.filter((s) => s.cvSuspicious);
  const rdHits = screens.filter((s) => s.rdSuspicious);
  const rotHits = rotations.filter((r) => r.rotationSuspicious);

  const distinctScreens =
    (cvHits.length > 0 ? 1 : 0) + (rdHits.length > 0 ? 1 : 0) + (rotHits.length > 0 ? 1 : 0);
  const fired = distinctScreens >= 2; // one screen alone is not probable cause

  let score = 0;
  if (fired) {
    score = 25;
    score += 15 * (distinctScreens - 1);
    score += Math.min(20, 4 * (cvHits.length + rdHits.length));
    score += Math.min(20, 10 * rotHits.length);
    score = Math.min(100, score);
  }

  return {
    kind: KIND,
    detector: DETECTOR,
    fired,
    score,
    domain: DOMAIN,
    subjectName,
    reason: fired
      ? `${distinctScreens}/3 independent collusion screens concordant for "${subjectName}": ` +
        `${cvHits.length} tender(s) with abnormally tight bids (CV<${CV_SUSPICIOUS}), ` +
        `${rdHits.length} with cover-bid gap (RD>${RD_SUSPICIOUS}), ` +
        `${rotHits.length} bidder group(s) rotating wins. Statistical screens only — ` +
        `market structure can mimic these patterns; corroborate before escalating.`
      : `Fewer than 2 collusion screens fired across ${tenders.length} tender(s).`,
    evidence: { screens, rotations },
  };
}
