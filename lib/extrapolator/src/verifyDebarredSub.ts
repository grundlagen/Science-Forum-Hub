// Reproducible assertions for the debarred-sub detector (no network).
//   pnpm --filter @workspace/extrapolator run verify-debarred-sub
import { buildExclusionIndex, type ExclusionRecord } from "@workspace/integration-sam-exclusions";
import type { SubawardRecord } from "@workspace/integration-usaspending";
import { detectDebarredSubs } from "./detectors/debarredSub";
import { assembleGeneralCase, renderGeneralCase } from "./generalCase";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

const exclusions: ExclusionRecord[] = [
  {
    name: "Sub Co",
    uei: "SUB123",
    classification: "Firm",
    exclusionType: "Ineligible (Proceedings Completed)",
    activationDate: "2020-01-01",
    terminationDate: "Indefinite",
  },
];
const index = buildExclusionIndex(exclusions);

const subawards: SubawardRecord[] = [
  {
    subAwardId: "S1",
    subRecipientName: "SUB CO",
    amount: 200_000,
    actionDate: "2022-03-01",
    primeAwardId: "P1",
    primeRecipientName: "Prime Inc",
    awardingAgency: "Department of Defense",
  },
  {
    subAwardId: "S2",
    subRecipientName: "Clean Sub LLC",
    amount: 50_000,
    actionDate: "2022-03-01",
    primeAwardId: "P2",
    primeRecipientName: "Prime Inc",
    awardingAgency: "Department of Defense",
  },
];

const { signals, matches } = detectDebarredSubs(subawards, index);
check("one debarred-sub match", matches.length === 1);
check("clean sub not flagged", !matches.some((m) => m.subaward.subRecipientName === "Clean Sub LLC"));
check("kind = debarred_recipient", signals[0]?.kind === "debarred_recipient");
check("score == 55 (name45 + >100k 10)", signals[0]?.score === 55);
check("evidence marks the sub tier", (signals[0]?.evidence as { tier?: string }).tier === "sub");

const gc = assembleGeneralCase(signals[0], { estimatedRecoveryUsd: 200_000 });
check("maps to FCA", gc.programs.some((p) => p.id === "fca"));
const md = renderGeneralCase(gc);
check("render has Ethics & handling", md.includes("Ethics & handling"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
