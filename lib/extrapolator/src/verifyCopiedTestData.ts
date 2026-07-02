// Reproducible assertions for the copied-test-data detector (no network).
//   pnpm --filter @workspace/extrapolator run verify-copied-test-data
import { detectCopiedTestData, findCopiedTestData, longestSharedRun } from "./detectors/copiedTestData";
import type { TestSubmission } from "./detectors/copiedTestData";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

// Plausible-looking asphalt QC vectors (air voids %, density, stability...).
const base = [3.9, 96.1, 14.2, 4.05, 95.8, 13.9, 4.11, 96.0, 14.5, 3.85];
const noisy = base.map((v, i) => v + 0.01 * (i + 1)); // genuinely re-measured (every value differs)
const sub = (id: string, values: number[], project = "P1"): TestSubmission => ({
  submissionId: id,
  project,
  values,
});

// 1. Independent measurements do not fire.
const clean = detectCopiedTestData("Clean Paving Co", [sub("t1", base), sub("t2", noisy)]);
check("independent measurements do not fire", clean.fired === false && clean.score === 0);

// 2. An exact duplicate submission fires.
const dup = detectCopiedTestData("Copy Paving Co", [sub("t1", base), sub("t2", [...base])]);
check("exact duplicate fires", dup.fired === true);
check("exact duplicate scores meaningfully", dup.score >= 40);

// 3. Cross-project duplication scores higher than same-project duplication.
const cross = detectCopiedTestData("Cross Paving Co", [sub("t1", base, "P1"), sub("t2", [...base], "P2")]);
check("cross-project reuse scores higher", cross.score > dup.score);

// 4. A copied run inside otherwise-different submissions is found.
const spliced = [...noisy.slice(0, 2), ...base.slice(2, 8), 9.9, 8.8];
const runFinding = findCopiedTestData([sub("t1", base), sub("t2", spliced)]);
check("shared run detected", runFinding.sharedRuns.length === 1);
check("shared run length correct", runFinding.sharedRuns[0].runLength === 6);

// 5. longestSharedRun requires the minimum window.
const short = longestSharedRun(base, [...noisy.slice(0, 6), ...base.slice(0, 4)]);
check("runs shorter than window are ignored", short.length < 5);

// 6. Score bounded.
const many: TestSubmission[] = Array.from({ length: 12 }, (_, i) => sub(`t${i}`, [...base], i % 2 ? "P1" : "P2"));
const flood = detectCopiedTestData("Flood Co", many);
check("score bounded at 100", flood.score <= 100 && flood.fired === true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
