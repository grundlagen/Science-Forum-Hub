// Reproducible assertions for the cross-source reasoning layer (no network).
//   pnpm --filter @workspace/extrapolator run verify-corroborate
import { corroborate, corroborateAll } from "./corroborate";
import type { DetectorSignal } from "./detectors/base";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

const sig = (detector: string, score: number, domain: DetectorSignal["domain"], subject: string): DetectorSignal => ({
  kind: "other",
  detector,
  fired: true,
  score,
  reason: "test",
  evidence: {},
  domain,
  subjectName: subject,
});

// 1. Single high-scoring signal is CAPPED (can't carry a case alone).
const single = corroborate("Acme", [sig("debarred-recipient/v1", 90, "general_federal_award", "Acme")]);
check("single source capped at 60", single.combinedConfidence === 60);
check("single source not corroborated", single.corroborated === false);
check("single source recommends seeking corroboration", single.recommendation.includes("Seek independent corroboration"));

// 2. Two independent detectors raise combined confidence above the single cap.
const multi = corroborate("Acme", [
  sig("debarred-recipient/v1", 55, "general_federal_award", "Acme"),
  sig("dedupe/duplicate-award/v1", 50, "general_federal_award", "Acme"),
]);
check("two detectors corroborated", multi.corroborated === true);
check("two detectors exceed single cap", multi.combinedConfidence > 60);
check("distinctDetectors counted", multi.distinctDetectors === 2);

// 3. corroborateAll groups by subject and sorts by combined confidence.
const all = corroborateAll([
  sig("d1", 55, "general_federal_award", "Acme"),
  sig("d2", 50, "general_federal_award", "Acme"),
  sig("d3", 40, "healthcare_billing", "Beta"),
]);
check("grouped into two subjects", all.length === 2);
check("Acme (corroborated) ranks first", all[0].subject === "Acme");
check("all combined confidences bounded", all.every((f) => f.combinedConfidence >= 0 && f.combinedConfidence <= 100));

// 4. No fired signals -> zero confidence.
const none = corroborate("Ghost", [{ ...sig("d", 90, "tax", "Ghost"), fired: false }]);
check("unfired signals give 0 confidence", none.combinedConfidence === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
