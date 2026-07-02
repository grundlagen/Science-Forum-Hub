// Native statcheck: recompute the p-value of a reported NHST result from its test
// statistic + degrees of freedom, then compare to the reported p. Reimplements the
// core of Nuijten et al.'s "statcheck" (a spellchecker for statistics) so the forum
// can run it with no external R dependency. ~half of published psychology papers carry
// at least one inconsistency; ~1 in 8 a "gross"/decision inconsistency.
//
// A reported result is:
//   - inconsistent          : recomputed p disagrees with reported p (beyond rounding);
//   - decision-inconsistent  : significance verdict flips at alpha (the serious kind).
import { tTwoTailedP, chiSquareUpperP, fUpperP, zTwoTailedP, rTwoTailedP } from "../stats/mathdist";

export type TestType = "t" | "F" | "chi2" | "z" | "r";
export type Comparator = "=" | "<" | ">" | "<=" | ">=";

export interface NhstResult {
  type: TestType;
  df1?: number; // t: df; F: numerator df; chi2: df; r: n (observations)
  df2?: number; // F: denominator df
  statistic: number;
  comparator: Comparator; // as reported, e.g. p < .05
  reportedP: number;
  alpha?: number; // default 0.05
}

export interface StatcheckFinding {
  result: NhstResult;
  computedP: number;
  inconsistent: boolean;
  decisionInconsistent: boolean;
  note: string;
}

export function recomputeP(r: NhstResult): number {
  switch (r.type) {
    case "t":
      return tTwoTailedP(r.statistic, r.df1 ?? NaN);
    case "F":
      return fUpperP(r.statistic, r.df1 ?? NaN, r.df2 ?? NaN);
    case "chi2":
      return chiSquareUpperP(r.statistic, r.df1 ?? NaN);
    case "z":
      return zTwoTailedP(r.statistic);
    case "r":
      return rTwoTailedP(r.statistic, r.df1 ?? NaN);
  }
}

// Does the reported comparator/value hold for the recomputed p, allowing for the
// rounding implied by the reported number of decimals? statcheck rounds both sides.
function reportedHolds(reportedP: number, comparator: Comparator, computedP: number): boolean {
  // Round the computed p to the reported precision before comparing (statcheck's rule).
  const decimals = decimalsOf(reportedP);
  const rc = round(computedP, decimals);
  const rp = round(reportedP, decimals);
  switch (comparator) {
    case "=":
      return rc === rp;
    case "<":
      return computedP < reportedP;
    case "<=":
      return computedP <= reportedP;
    case ">":
      return computedP > reportedP;
    case ">=":
      return computedP >= reportedP;
  }
}

function decimalsOf(x: number): number {
  const s = String(x);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}
function round(x: number, d: number): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

export function checkResult(r: NhstResult): StatcheckFinding {
  const alpha = r.alpha ?? 0.05;
  const computedP = recomputeP(r);
  const inconsistent = Number.isFinite(computedP) ? !reportedHolds(r.reportedP, r.comparator, computedP) : true;

  // Decision inconsistency: the significance verdict flips. Use the reported p's
  // implied verdict vs the recomputed p's verdict at alpha.
  const reportedSig = r.comparator === "<" || r.comparator === "<=" ? r.reportedP <= alpha : r.reportedP < alpha;
  const computedSig = computedP < alpha;
  const decisionInconsistent = inconsistent && reportedSig !== computedSig;

  const note = !Number.isFinite(computedP)
    ? "could not recompute (bad df/statistic)"
    : decisionInconsistent
      ? `DECISION inconsistency: reported ${reportedSig ? "significant" : "n.s."}, recomputed p=${computedP.toFixed(4)} is ${computedSig ? "significant" : "n.s."}`
      : inconsistent
        ? `inconsistency: reported p${r.comparator}${r.reportedP}, recomputed p=${computedP.toFixed(4)}`
        : `consistent (recomputed p=${computedP.toFixed(4)})`;

  return { result: r, computedP, inconsistent, decisionInconsistent, note };
}

export interface StatcheckReport {
  results: StatcheckFinding[];
  inconsistencies: number;
  decisionInconsistencies: number;
}

export function statcheck(results: NhstResult[]): StatcheckReport {
  const findings = results.map(checkResult);
  return {
    results: findings,
    inconsistencies: findings.filter((f) => f.inconsistent).length,
    decisionInconsistencies: findings.filter((f) => f.decisionInconsistent).length,
  };
}
