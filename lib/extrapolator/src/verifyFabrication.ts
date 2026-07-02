// Reproducible assertions for the statistical fabrication screens (no network).
//   pnpm --filter @workspace/extrapolator run verify-fabrication
import {
  grimTest,
  benfordTest,
  terminalDigitTest,
  detectFabricatedStats,
} from "./stats/fabrication";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

// ---- GRIM
// n=28, integer data: possible means step by 1/28. 5.19 is impossible at 2 decimals
// (145/28 = 5.179 -> 5.18; 146/28 = 5.214 -> 5.21).
check("GRIM: impossible mean caught", grimTest(5.19, 28, 2).consistent === false);
// 145/28 rounds to 5.18 — possible.
check("GRIM: possible mean passes", grimTest(5.18, 28, 2).consistent === true);
// Whole-number mean is always possible.
check("GRIM: integer mean passes", grimTest(4, 25, 2).consistent === true);

// ---- Benford
// Naturally-scaled amounts: log-uniform values follow Benford by construction.
const natural: number[] = Array.from({ length: 500 }, (_, i) => 10 ** (2 + (4 * i) / 500));
const nat = benfordTest(natural);
check("Benford: log-uniform amounts pass", nat.suspicious === false);

// Invented ledger: humans favor mid-range first digits (5s and 6s).
const invented: number[] = [];
for (let i = 0; i < 500; i++) invented.push((5 + (i % 2)) * 1000 + (i % 97));
const inv = benfordTest(invented);
check("Benford: invented amounts flagged", inv.suspicious === true);

// Too few values: not applicable, never suspicious.
const few = benfordTest([123, 456, 789]);
check("Benford: small samples not applicable", few.applicable === false && few.suspicious === false);

// ---- terminal digits
const uniformLast: number[] = Array.from({ length: 300 }, (_, i) => 1000 + i);
check("terminal digits: sequential data uniform", terminalDigitTest(uniformLast).suspicious === false);
const roundedLast: number[] = Array.from({ length: 300 }, (_, i) => 1000 + 10 * i); // all end in 0
check("terminal digits: over-rounded data flagged", terminalDigitTest(roundedLast).suspicious === true);

// ---- detector wrapper
const cleanSig = detectFabricatedStats("Honest Lab", "research_grants", [
  { label: "age", mean: 5.18, n: 28, decimals: 2 },
]);
check("detector silent on clean stats", cleanSig.fired === false);

const dirtySig = detectFabricatedStats(
  "Suspect Lab",
  "research_grants",
  [{ label: "age", mean: 5.19, n: 28, decimals: 2 }],
  { label: "expenses", values: invented },
);
check("detector fires on GRIM + Benford", dirtySig.fired === true);
check("GRIM carries more than Benford alone", dirtySig.score >= 40);
check("score bounded", dirtySig.score <= 100);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
