// Whistleblower / relator program registry — "what governments offer."
//
// IMPORTANT distinction: only the US FCA (and state FCAs) use the *qui tam* model —
// a private party files suit and shares the recovery. Everywhere else is a *tip-reward*
// model: you report to an agency, the agency acts, and you may receive a percentage.
// The EU pays no bounty at all. Reward percentages/thresholds are simplified; verify
// with counsel. Not legal advice.
import type { FraudDomain } from "@workspace/db/schema";

export type Jurisdiction = "US" | "CA" | "UK" | "KR" | "EU";

export interface WhistleblowerProgram {
  id: string;
  name: string;
  jurisdiction: Jurisdiction;
  agency: string;
  statute: string;
  isQuiTam: boolean; // true only for private civil enforcement (US/state FCA)
  rewardMinPct: number;
  rewardMaxPct: number;
  rewardThresholdUsd: number | null;
  filedUnderSeal: boolean;
  anonymousAllowed: boolean;
  domains: FraudDomain[];
  notes: string;
}

export const PROGRAMS: WhistleblowerProgram[] = [
  // ---- United States ----
  {
    id: "fca",
    name: "False Claims Act (qui tam)",
    jurisdiction: "US",
    agency: "DOJ",
    statute: "31 U.S.C. §§ 3729–3733",
    isQuiTam: true,
    rewardMinPct: 0.15,
    rewardMaxPct: 0.3, // 15–25% intervened; 25–30% declined
    rewardThresholdUsd: null,
    filedUnderSeal: true,
    anonymousAllowed: false,
    domains: [
      "research_grants",
      "healthcare_billing",
      "defense_procurement",
      "ppp_covid_relief",
      "sba_loans",
      "customs_tariff",
      "cybersecurity_compliance",
      "education_grants",
      "general_federal_award",
    ],
    notes: "Filed under seal; government may intervene. Core program for misuse of federal funds.",
  },
  {
    id: "sec",
    name: "SEC Whistleblower Program",
    jurisdiction: "US",
    agency: "SEC",
    statute: "Dodd-Frank §21F (15 U.S.C. §78u-6)",
    isQuiTam: false,
    rewardMinPct: 0.1,
    rewardMaxPct: 0.3,
    rewardThresholdUsd: 1_000_000,
    filedUnderSeal: false,
    anonymousAllowed: true,
    domains: ["securities"],
    notes: "Awards on monetary sanctions > $1M. Anonymous filing allowed via counsel.",
  },
  {
    id: "cftc",
    name: "CFTC Whistleblower Program",
    jurisdiction: "US",
    agency: "CFTC",
    statute: "CEA §23 (7 U.S.C. §26)",
    isQuiTam: false,
    rewardMinPct: 0.1,
    rewardMaxPct: 0.3,
    rewardThresholdUsd: 1_000_000,
    filedUnderSeal: false,
    anonymousAllowed: true,
    domains: ["commodities"],
    notes: "Commodities/derivatives fraud, spoofing, manipulation. Sanctions > $1M.",
  },
  {
    id: "irs",
    name: "IRS Whistleblower Program",
    jurisdiction: "US",
    agency: "IRS",
    statute: "26 U.S.C. §7623(b)",
    isQuiTam: false,
    rewardMinPct: 0.15,
    rewardMaxPct: 0.3,
    rewardThresholdUsd: 2_000_000,
    filedUnderSeal: false,
    anonymousAllowed: false,
    domains: ["tax"],
    notes: "Mandatory award range when amounts in dispute > $2M (individuals: gross income > $200k).",
  },
  {
    id: "fincen",
    name: "AML / Sanctions Whistleblower Program",
    jurisdiction: "US",
    agency: "FinCEN (Treasury)",
    statute: "31 U.S.C. §5323 (AML Act 2020)",
    isQuiTam: false,
    rewardMinPct: 0.1,
    rewardMaxPct: 0.3,
    rewardThresholdUsd: 1_000_000,
    filedUnderSeal: false,
    anonymousAllowed: true,
    domains: ["money_laundering_sanctions"],
    notes: "Bank Secrecy Act and sanctions violations. Awards on sanctions > $1M.",
  },
  {
    id: "doj_corporate",
    name: "DOJ Corporate Whistleblower Awards Pilot",
    jurisdiction: "US",
    agency: "DOJ Criminal Division",
    statute: "DOJ pilot policy (Aug 2024; expanded May 2025)",
    isQuiTam: false,
    rewardMinPct: 0.15,
    rewardMaxPct: 0.3, // up to 30% of first $100M net forfeited; presumption of max 30% on first $10M
    rewardThresholdUsd: 1_000_000,
    filedUnderSeal: false,
    anonymousAllowed: false,
    domains: [
      "general_federal_award",
      "customs_tariff",
      "money_laundering_sanctions",
      "financial_institution_crime",
      "immigration",
    ],
    notes:
      "Forfeiture-based criminal program. May-2025 expansion added federal-contracting/funding fraud (non-healthcare), trade/tariff/customs, sanctions, immigration, cartels. (Pilot also covers PRIVATE-plan health fraud — distinct from federal FCA.)",
  },
  {
    id: "doj_antitrust",
    name: "DOJ Antitrust Whistleblower Rewards Program",
    jurisdiction: "US",
    agency: "DOJ Antitrust Division",
    statute: "Antitrust Division policy (Jul 2025)",
    isQuiTam: false,
    rewardMinPct: 0.15,
    rewardMaxPct: 0.3,
    rewardThresholdUsd: 1_000_000,
    filedUnderSeal: false,
    anonymousAllowed: false,
    domains: ["antitrust_bid_rigging", "defense_procurement"],
    notes: "Criminal Sherman Act (bid rigging, price fixing, market allocation), incl. public procurement. 15–30% of fines ≥ $1M.",
  },
  {
    id: "state_fca",
    name: "State False Claims Acts",
    jurisdiction: "US",
    agency: "State AGs (~30 states)",
    statute: "State qui tam statutes",
    isQuiTam: true,
    rewardMinPct: 0.15,
    rewardMaxPct: 0.3,
    rewardThresholdUsd: null,
    filedUnderSeal: true,
    anonymousAllowed: false,
    domains: ["healthcare_billing", "general_federal_award"],
    notes: "Mostly state Medicaid / state-funded programs; mirrors the federal FCA.",
  },
  // ---- Non-US (tip-reward, NOT qui tam). Opt in via programsForDomain(domain,{jurisdiction:'all'}). ----
  {
    id: "ca_cra_otip",
    name: "CRA Offshore Tax Informant Program (OTIP)",
    jurisdiction: "CA",
    agency: "Canada Revenue Agency",
    statute: "OTIP (2014)",
    isQuiTam: false,
    rewardMinPct: 0.05,
    rewardMaxPct: 0.15,
    rewardThresholdUsd: 100_000,
    filedUnderSeal: false,
    anonymousAllowed: false,
    domains: ["tax"],
    notes: "5–15% of federal tax collected when > CAD 100k; offshore non-compliance.",
  },
  {
    id: "ca_osc",
    name: "Ontario Securities Commission Whistleblower Program",
    jurisdiction: "CA",
    agency: "OSC (Ontario)",
    statute: "OSC policy (2016)",
    isQuiTam: false,
    rewardMinPct: 0.05,
    rewardMaxPct: 0.15,
    rewardThresholdUsd: 1_000_000,
    filedUnderSeal: false,
    anonymousAllowed: true,
    domains: ["securities"],
    notes: "5–15% of sanctions > CAD 1M, capped around CAD 5M. First reward program of its kind in Canada.",
  },
  {
    id: "uk_hmrc",
    name: "HMRC Whistleblower Reward Scheme",
    jurisdiction: "UK",
    agency: "HMRC",
    statute: "Announced Nov 2025 Budget (US-style)",
    isQuiTam: false,
    rewardMinPct: 0.0,
    rewardMaxPct: 0.25,
    rewardThresholdUsd: null,
    filedUnderSeal: false,
    anonymousAllowed: false,
    domains: ["tax"],
    notes: "Up to 25% of additional tax recovered. UK has NO qui tam; SFO incentive scheme still exploratory.",
  },
  {
    id: "kr_nts",
    name: "South Korea NTS Tax Whistleblower Rewards",
    jurisdiction: "KR",
    agency: "National Tax Service",
    statute: "NTS reward programs",
    isQuiTam: false,
    rewardMinPct: 0.05,
    rewardMaxPct: 0.2,
    rewardThresholdUsd: null,
    filedUnderSeal: false,
    anonymousAllowed: false,
    domains: ["tax"],
    notes: "Long-running tax-evasion reward program; among the most active non-US reward systems.",
  },
];

export function getProgram(id: string): WhistleblowerProgram | undefined {
  return PROGRAMS.find((p) => p.id === id);
}

/** Programs covering a domain. Defaults to US (the qui-tam/FCA world); pass
 *  {jurisdiction:"all"} or a specific code to include non-US tip-reward programs. */
export function programsForDomain(
  domain: FraudDomain,
  opts: { jurisdiction?: Jurisdiction | "all" } = {},
): WhistleblowerProgram[] {
  const j = opts.jurisdiction ?? "US";
  return PROGRAMS.filter((p) => p.domains.includes(domain) && (j === "all" || p.jurisdiction === j));
}

export interface RewardEstimate {
  programId: string;
  minUsd: number;
  maxUsd: number;
  qualifies: boolean;
  note: string;
}

/** Rough reward range for a hypothetical recovery. FCA band depends on intervention.
 *  Planning math only. */
export function estimateReward(
  program: WhistleblowerProgram,
  recoveryUsd: number,
  opts: { governmentDeclined?: boolean } = {},
): RewardEstimate {
  let minPct = program.rewardMinPct;
  let maxPct = program.rewardMaxPct;
  if (program.id === "fca") {
    if (opts.governmentDeclined) {
      minPct = 0.25;
      maxPct = 0.3;
    } else {
      minPct = 0.15;
      maxPct = 0.25;
    }
  }
  const qualifies = program.rewardThresholdUsd === null || recoveryUsd >= program.rewardThresholdUsd;
  return {
    programId: program.id,
    minUsd: Math.round(recoveryUsd * minPct),
    maxUsd: Math.round(recoveryUsd * maxPct),
    qualifies,
    note: qualifies
      ? `${Math.round(minPct * 100)}–${Math.round(maxPct * 100)}% of recovery`
      : `Below the program's $${program.rewardThresholdUsd?.toLocaleString()} threshold`,
  };
}
