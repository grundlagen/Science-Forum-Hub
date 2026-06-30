// US whistleblower / relator program registry — "what the government offers."
//
// These are the federal award programs that pay whistleblowers a share of recovery.
// Reward percentages and thresholds are statutory but simplified; verify with counsel
// before relying on a specific figure. Not legal advice.
import type { FraudDomain } from "@workspace/db/schema";

export interface WhistleblowerProgram {
  id: string;
  name: string;
  agency: string;
  statute: string;
  rewardMinPct: number; // fraction (0.15 = 15%)
  rewardMaxPct: number;
  rewardThresholdUsd: number | null; // minimum recovery/sanction to qualify
  filedUnderSeal: boolean;
  anonymousAllowed: boolean;
  domains: FraudDomain[];
  notes: string;
}

export const PROGRAMS: WhistleblowerProgram[] = [
  {
    id: "fca",
    name: "False Claims Act (qui tam)",
    agency: "DOJ",
    statute: "31 U.S.C. §§ 3729–3733",
    rewardMinPct: 0.15,
    rewardMaxPct: 0.3, // 15–25% if DOJ intervenes; 25–30% if it declines
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
    agency: "SEC",
    statute: "Dodd-Frank §21F (15 U.S.C. §78u-6)",
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
    agency: "CFTC",
    statute: "CEA §23 (7 U.S.C. §26)",
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
    agency: "IRS",
    statute: "26 U.S.C. §7623(b)",
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
    agency: "FinCEN (Treasury)",
    statute: "31 U.S.C. §5323 (AML Act 2020, as amended)",
    rewardMinPct: 0.1,
    rewardMaxPct: 0.3,
    rewardThresholdUsd: 1_000_000,
    filedUnderSeal: false,
    anonymousAllowed: true,
    domains: ["money_laundering_sanctions"],
    notes: "Bank Secrecy Act and sanctions violations. Awards on sanctions > $1M.",
  },
  {
    id: "state_fca",
    name: "State False Claims Acts",
    agency: "State AGs (~30 states)",
    statute: "State qui tam statutes",
    rewardMinPct: 0.15,
    rewardMaxPct: 0.3,
    rewardThresholdUsd: null,
    filedUnderSeal: true,
    anonymousAllowed: false,
    domains: ["healthcare_billing", "general_federal_award"],
    notes: "Mostly state Medicaid and state-funded programs; mirrors the federal FCA.",
  },
];

export function getProgram(id: string): WhistleblowerProgram | undefined {
  return PROGRAMS.find((p) => p.id === id);
}

export function programsForDomain(domain: FraudDomain): WhistleblowerProgram[] {
  return PROGRAMS.filter((p) => p.domains.includes(domain));
}

export interface RewardEstimate {
  programId: string;
  minUsd: number;
  maxUsd: number;
  qualifies: boolean;
  note: string;
}

/**
 * Rough reward range for a hypothetical recovery. For the FCA, the band depends on
 * whether DOJ intervenes (15–25%) or declines (25–30%). Planning math only.
 */
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
