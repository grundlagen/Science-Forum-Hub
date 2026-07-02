// PPP loan anomaly detector over the public SBA FOIA loan-level dataset. PPP data
// mining is the most active data-miner qui tam area (DOJ FOCUS commentary; e.g. the
// $1.8M Texas concrete-manufacturer settlement built on public loan disclosures
// cross-referenced against registries and company statements).
//
// Checks (all computable from the public CSV alone):
//   per-job cap    — first-draw loans were capped at avg monthly payroll * 2.5 with
//                    payroll per employee capped at $100k/yr => max $20,833/job.
//                    amount/jobsReported far above that is arithmetically impossible
//                    unless jobs were understated on the public file or overstated
//                    on the application.
//   excess draws   — a borrower could receive at most one first-draw + one
//                    second-draw loan. >2 loans on the same name+address = duplicate
//                    applications (a common criminal-case pattern).
//   forgiveness    — forgiveness exceeding the approved amount (plus modest accrued
//                    interest) shouldn't happen on clean records.
//
// Public-file caveats matter: jobs fields are sometimes blank or 0 legitimately, and
// name collisions happen. The detector demands margin above the cap and skips blanks.
import type { SignalKind, FraudDomain } from "@workspace/db/schema";
import type { PppLoanRecord, PppIndex } from "@workspace/integration-sba-ppp";
import { normalizeName, normalizeAddress } from "@workspace/integration-sba-ppp";
import type { DetectorSignal } from "./base";

const KIND: SignalKind = "ppp_anomaly";
const DOMAIN: FraudDomain = "ppp_covid_relief";
const DETECTOR = "ppp-anomaly/v1";

export const MAX_PER_JOB = 20_833; // $100k/12 * 2.5, the first-draw per-employee ceiling
export const PER_JOB_MARGIN = 1.5; // demand 50% headroom over the cap before flagging
export const MAX_DRAWS = 2; // one first-draw + one second-draw
export const FORGIVENESS_SLACK = 1.06; // approved * ~6% (1% interest, capped tenor slack)

export interface PppAnomalies {
  perJobViolations: Array<{ loan: PppLoanRecord; perJob: number }>;
  excessDraws: Array<{ key: string; loans: PppLoanRecord[] }>;
  forgivenessOverruns: Array<{ loan: PppLoanRecord; excess: number }>;
}

export function findPppAnomalies(records: PppLoanRecord[], index: PppIndex): PppAnomalies {
  const perJobViolations: PppAnomalies["perJobViolations"] = [];
  const forgivenessOverruns: PppAnomalies["forgivenessOverruns"] = [];
  for (const loan of records) {
    const amount = loan.currentApprovalAmount ?? loan.initialApprovalAmount;
    if (amount != null && loan.jobsReported != null && loan.jobsReported > 0) {
      const perJob = amount / loan.jobsReported;
      if (perJob > MAX_PER_JOB * PER_JOB_MARGIN) perJobViolations.push({ loan, perJob });
    }
    if (
      loan.forgivenessAmount != null &&
      amount != null &&
      amount > 0 &&
      loan.forgivenessAmount > amount * FORGIVENESS_SLACK
    ) {
      forgivenessOverruns.push({ loan, excess: loan.forgivenessAmount - amount });
    }
  }

  // Excess draws: same normalized name AND address with more than MAX_DRAWS loans.
  const excessDraws: PppAnomalies["excessDraws"] = [];
  const seen = new Set<string>();
  for (const loan of records) {
    const key = `${normalizeName(loan.borrowerName)}::${normalizeAddress(loan)}`;
    if (seen.has(key) || key.endsWith("::")) continue;
    seen.add(key);
    const sameName = index.byName.get(normalizeName(loan.borrowerName)) ?? [];
    const same = sameName.filter((l) => normalizeAddress(l) === normalizeAddress(loan));
    const distinct = new Map(same.map((l) => [l.loanNumber ?? Math.random().toString(), l]));
    if (distinct.size > MAX_DRAWS) excessDraws.push({ key, loans: [...distinct.values()] });
  }
  return { perJobViolations, excessDraws, forgivenessOverruns };
}

export function detectPppAnomalies(records: PppLoanRecord[], index: PppIndex): DetectorSignal[] {
  const found = findPppAnomalies(records, index);
  const signals: DetectorSignal[] = [];

  for (const v of found.perJobViolations) {
    const score = Math.min(100, 35 + Math.min(35, ((v.perJob / MAX_PER_JOB) - 1) * 20));
    signals.push({
      kind: KIND,
      detector: DETECTOR,
      fired: true,
      score,
      domain: DOMAIN,
      subjectName: v.loan.borrowerName,
      reason:
        `PPP loan ${v.loan.loanNumber ?? "?"} to "${v.loan.borrowerName}" works out to ` +
        `$${Math.round(v.perJob).toLocaleString()}/job vs the $${MAX_PER_JOB.toLocaleString()} ` +
        `first-draw ceiling. Public jobs fields can be blank-or-wrong for benign reasons — ` +
        `verify draw type and payroll basis before any action.`,
      evidence: v,
    });
  }
  for (const d of found.excessDraws) {
    signals.push({
      kind: KIND,
      detector: DETECTOR,
      fired: true,
      score: Math.min(100, 40 + 15 * (d.loans.length - MAX_DRAWS)),
      domain: DOMAIN,
      subjectName: d.loans[0].borrowerName,
      reason:
        `${d.loans.length} PPP loans at the same borrower name + address ` +
        `("${d.loans[0].borrowerName}") vs a maximum of ${MAX_DRAWS} draws. ` +
        `Check for affiliates legally sharing an address before any action.`,
      evidence: d,
    });
  }
  for (const f of found.forgivenessOverruns) {
    signals.push({
      kind: KIND,
      detector: DETECTOR,
      fired: true,
      score: 45,
      domain: DOMAIN,
      subjectName: f.loan.borrowerName,
      reason:
        `PPP forgiveness for "${f.loan.borrowerName}" exceeds the approved amount by ` +
        `$${Math.round(f.excess).toLocaleString()} beyond interest slack. Data-entry ` +
        `artifacts occur in the public file — verify against SBA records.`,
      evidence: f,
    });
  }
  return signals;
}
