// Pass-through / front detector for set-aside programs (DBE, 8(a), SDVOSB, WOSB).
// Modeled on the DBE-fraud line of FCA cases: a certified disadvantaged firm is used
// as a paper conduit while a non-eligible firm performs the work — e.g. Platt Bridge
// (Sherwin-Williams, $1M), Whittier Bridge/I-95 (Walsh, ~$1.1M), Detroit Metro Airport
// ($11.75M). The regulations require the DBE to perform a "commercially useful
// function"; a front fails that test.
//
// Signals (each is weak alone; the score is corroboration-driven):
//   shared identity  — sub shares an address/officer with the prime (classic front);
//   pass-through     — the sub receives an implausibly high share of the prime award
//                      (a real sub does a scoped slice, a conduit takes the set-aside
//                      quota and hands the work back);
//   exclusivity      — the certified sub only ever appears under one prime across
//                      many awards (captive front).
import type { SignalKind, FraudDomain } from "@workspace/db/schema";
import type { SubawardRecord } from "@workspace/integration-usaspending";
import { normalizeName } from "@workspace/integration-sam-exclusions";
import type { DetectorSignal } from "./base";

const KIND: SignalKind = "pass_through_front";
const DOMAIN: FraudDomain = "general_federal_award";
const DETECTOR = "pass-through-front/v1";

/** Optional identity facts (from state corporate registries / SAM entity records). */
export interface EntityIdentity {
  name: string;
  address?: string;
  officers?: string[];
}

export const PASS_THROUGH_RATIO = 0.7; // sub share of prime award that suggests a conduit
export const MIN_EXCLUSIVE_AWARDS = 4; // sub-awards under a single prime to call captivity

function normAddress(a?: string): string {
  return (a ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export interface FrontIndicators {
  sharedAddress: boolean;
  sharedOfficers: string[];
  passThroughAwards: Array<{ primeAwardId: string | null; ratio: number }>;
  exclusiveSubAwards: number; // sub-awards seen, all under the same prime
  distinctPrimes: number;
}

/**
 * Evaluate one certified sub against one prime, over the sub-awards linking them
 * (`subawards`), prime award totals (`primeAmounts` keyed by prime award id), and
 * optional registry identities.
 */
export function findFrontIndicators(
  prime: EntityIdentity,
  sub: EntityIdentity,
  subawards: SubawardRecord[],
  primeAmounts: Map<string, number>,
): FrontIndicators {
  const subKey = normalizeName(sub.name);
  const primeKey = normalizeName(prime.name);
  const mine = subawards.filter((s) => normalizeName(s.subRecipientName ?? "") === subKey);

  const sharedAddress =
    normAddress(prime.address) !== "" && normAddress(prime.address) === normAddress(sub.address);
  const primeOfficers = new Set((prime.officers ?? []).map((o) => normalizeName(o)));
  const sharedOfficers = (sub.officers ?? []).filter((o) => primeOfficers.has(normalizeName(o)));

  const passThroughAwards: Array<{ primeAwardId: string | null; ratio: number }> = [];
  for (const s of mine) {
    if (normalizeName(s.primeRecipientName ?? "") !== primeKey) continue;
    const total = s.primeAwardId != null ? primeAmounts.get(s.primeAwardId) : undefined;
    if (total && total > 0 && s.amount != null) {
      const ratio = s.amount / total;
      if (ratio >= PASS_THROUGH_RATIO) passThroughAwards.push({ primeAwardId: s.primeAwardId, ratio });
    }
  }

  const primes = new Set(mine.map((s) => normalizeName(s.primeRecipientName ?? "")));
  primes.delete("");
  const exclusive = primes.size === 1 && primes.has(primeKey) ? mine.length : 0;

  return {
    sharedAddress,
    sharedOfficers,
    passThroughAwards,
    exclusiveSubAwards: exclusive,
    distinctPrimes: primes.size,
  };
}

export function detectPassThroughFront(
  prime: EntityIdentity,
  sub: EntityIdentity,
  subawards: SubawardRecord[],
  primeAmounts: Map<string, number>,
): DetectorSignal {
  const ind = findFrontIndicators(prime, sub, subawards, primeAmounts);
  const indicators =
    (ind.sharedAddress ? 1 : 0) +
    (ind.sharedOfficers.length > 0 ? 1 : 0) +
    (ind.passThroughAwards.length > 0 ? 1 : 0) +
    (ind.exclusiveSubAwards >= MIN_EXCLUSIVE_AWARDS ? 1 : 0);
  const fired = indicators >= 2; // one indicator alone is routine business

  let score = 0;
  if (fired) {
    score = 30;
    score += 20 * (indicators - 2);
    if (ind.sharedAddress && ind.sharedOfficers.length > 0) score += 15; // same shop, two names
    score += Math.min(15, 5 * ind.passThroughAwards.length);
    score = Math.min(100, score);
  }

  const parts: string[] = [];
  if (ind.sharedAddress) parts.push("shared address");
  if (ind.sharedOfficers.length > 0) parts.push(`shared officer(s): ${ind.sharedOfficers.join(", ")}`);
  if (ind.passThroughAwards.length > 0)
    parts.push(`${ind.passThroughAwards.length} award(s) with >=${PASS_THROUGH_RATIO * 100}% pass-through`);
  if (ind.exclusiveSubAwards >= MIN_EXCLUSIVE_AWARDS)
    parts.push(`${ind.exclusiveSubAwards} sub-awards, all under this single prime`);

  return {
    kind: KIND,
    detector: DETECTOR,
    fired,
    score,
    domain: DOMAIN,
    subjectName: `${prime.name} / ${sub.name}`,
    reason: fired
      ? `${indicators} independent front indicators between prime "${prime.name}" and certified ` +
        `sub "${sub.name}": ${parts.join("; ")}. Pattern matches DBE pass-through case law ` +
        `(commercially-useful-function test). Verify certification status and actual work ` +
        `performance before any action.`
      : `Fewer than 2 front indicators between "${prime.name}" and "${sub.name}".`,
    evidence: ind,
  };
}
