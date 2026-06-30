// Healthcare detector: an OIG-LEIE-excluded provider still drawing federal health-care
// dollars (e.g., Medicare Part D) at or after the exclusion date. Classic FCA signal.
//
// Pure logic over already-fetched payment records (CMS) + a LEIE index. Probable cause;
// identity (NPI) and dates must be human-verified.
import type { SignalKind, FraudDomain } from "@workspace/db/schema";
import type { ProviderPaymentRecord } from "@workspace/integration-cms";
import {
  normalizeName,
  type ExcludedProvider,
  type LeieIndex,
} from "@workspace/integration-oig-leie";
import type { DetectorSignal } from "./base";

const KIND: SignalKind = "excluded_provider";
const DOMAIN: FraudDomain = "healthcare_billing";
const DETECTOR = "excluded-provider/v1";

export function paymentAfterExclusion(payment: ProviderPaymentRecord, excl: ExcludedProvider): boolean {
  if (payment.year == null || !excl.exclDateIso) return false;
  const exclYear = Number(excl.exclDateIso.slice(0, 4));
  if (excl.reinDateIso) {
    const reinYear = Number(excl.reinDateIso.slice(0, 4));
    if (Number.isFinite(reinYear) && payment.year > reinYear) return false; // reinstated
  }
  return payment.year >= exclYear;
}

export interface ExcludedMatch {
  payment: ProviderPaymentRecord;
  excluded: ExcludedProvider;
  matchType: "npi" | "name";
  afterExclusion: boolean;
}

export function matchExcludedProviders(
  payments: ProviderPaymentRecord[],
  index: LeieIndex,
): ExcludedMatch[] {
  const matches: ExcludedMatch[] = [];
  for (const p of payments) {
    let hit: ExcludedProvider | undefined;
    let matchType: "npi" | "name" = "npi";
    if (p.npi && index.byNpi.has(p.npi)) {
      hit = index.byNpi.get(p.npi)![0];
      matchType = "npi";
    } else if (p.providerName) {
      const nk = normalizeName(p.providerName);
      if (nk && index.byName.has(nk)) {
        hit = index.byName.get(nk)![0];
        matchType = "name";
      }
    }
    if (hit) {
      matches.push({ payment: p, excluded: hit, matchType, afterExclusion: paymentAfterExclusion(p, hit) });
    }
  }
  return matches;
}

export function detectExcludedProviders(
  payments: ProviderPaymentRecord[],
  index: LeieIndex,
): { signals: DetectorSignal[]; matches: ExcludedMatch[] } {
  const matches = matchExcludedProviders(payments, index);
  const signals: DetectorSignal[] = matches.map((m) => {
    let score = m.matchType === "npi" ? 60 : 40; // NPI match is strong identity; name needs confirmation
    if (m.afterExclusion) score += 25;
    if ((m.payment.amountUsd ?? 0) > 100_000) score += 5;
    score = Math.min(100, score);
    const amt = m.payment.amountUsd != null ? `$${m.payment.amountUsd.toLocaleString()}` : "unknown amount";
    return {
      kind: KIND,
      detector: DETECTOR,
      fired: true,
      score,
      domain: DOMAIN,
      subjectName: m.payment.providerName ?? m.excluded.name,
      reason:
        `Provider ${m.payment.providerName ?? m.excluded.name} (NPI ${m.payment.npi ?? "?"}) drew ` +
        `${m.payment.program} dollars (${amt}, ${m.payment.year ?? "year ?"}) and appears on the OIG LEIE ` +
        `exclusion list (${m.excluded.exclType ?? "excluded"}, since ${m.excluded.exclDateIso ?? "?"})` +
        `${m.afterExclusion ? ", with payments at/after the exclusion date" : ""}. ` +
        `${m.matchType} match — confirm NPI identity and dates before any action.`,
      evidence: {
        payment: m.payment,
        excluded: m.excluded,
        matchType: m.matchType,
        afterExclusion: m.afterExclusion,
      },
    };
  });
  return { signals, matches };
}
