// Reproducible assertions for the distribution math + statcheck engine (no network).
//   pnpm --filter @workspace/extrapolator run verify-statcheck
import { tTwoTailedP, chiSquareUpperP, fUpperP, zTwoTailedP, rTwoTailedP } from "./stats/mathdist";
import { checkResult, statcheck, type NhstResult } from "./peerReview/statcheck";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}
const near = (a: number, b: number, tol = 0.004) => Math.abs(a - b) <= tol;

// 1. Distribution CDFs reproduce textbook critical values (two-tailed / upper p ≈ .05).
check("t(20)=2.086 -> p≈.05", near(tTwoTailedP(2.086, 20), 0.05));
check("t(20)=2.0 -> p≈.0594", near(tTwoTailedP(2.0, 20), 0.0594));
check("chi2(1)=3.841 -> p≈.05", near(chiSquareUpperP(3.841, 1), 0.05));
check("F(1,20)=4.351 -> p≈.05", near(fUpperP(4.351, 1, 20), 0.05));
check("z=1.96 -> p≈.05", near(zTwoTailedP(1.96), 0.05));
check("r=0.444,n=20 -> p≈.05", near(rTwoTailedP(0.444, 20), 0.05));

// 2. Consistent result: reported matches recomputed.
const c1 = checkResult({ type: "t", df1: 20, statistic: 2.086, comparator: "=", reportedP: 0.05 });
check("consistent t is not flagged", c1.inconsistent === false);
const c2 = checkResult({ type: "t", df1: 20, statistic: 3.0, comparator: "<", reportedP: 0.01 });
check("consistent 'p<.01' holds", c2.inconsistent === false);

// 3. General inconsistency (verdict unchanged): reported p=.03 but recomputed ≈.021.
const g = checkResult({ type: "t", df1: 20, statistic: 2.5, comparator: "=", reportedP: 0.03 });
check("general inconsistency detected", g.inconsistent === true);
check("general inconsistency is NOT a decision flip", g.decisionInconsistent === false);

// 4. Decision (gross) inconsistency: 'p<.05' claimed but recomputed ≈.149 (n.s.).
const d = checkResult({ type: "t", df1: 20, statistic: 1.5, comparator: "<", reportedP: 0.05 });
check("decision inconsistency detected", d.decisionInconsistent === true);
check("decision inconsistency is also an inconsistency", d.inconsistent === true);

// 5. Report aggregation counts both kinds.
const results: NhstResult[] = [
  { type: "t", df1: 20, statistic: 2.086, comparator: "=", reportedP: 0.05 }, // consistent
  { type: "t", df1: 20, statistic: 2.5, comparator: "=", reportedP: 0.03 }, // general
  { type: "t", df1: 20, statistic: 1.5, comparator: "<", reportedP: 0.05 }, // decision
];
const rep = statcheck(results);
check("report counts 2 inconsistencies", rep.inconsistencies === 2);
check("report counts 1 decision inconsistency", rep.decisionInconsistencies === 1);

// 6. Other families recompute and can be checked.
const chi = checkResult({ type: "chi2", df1: 1, statistic: 10.0, comparator: "<", reportedP: 0.05 });
check("chi2 consistent significant holds", chi.inconsistent === false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
