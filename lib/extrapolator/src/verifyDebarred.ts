// Reproducible assertions for the debarred-recipient detector + general case (no network).
//   pnpm --filter @workspace/extrapolator run verify-debarred
import { buildExclusionIndex, type ExclusionRecord } from "@workspace/integration-sam-exclusions";
import type { AwardRecord } from "@workspace/integration-usaspending";
import { detectDebarredRecipients, activeAtAward } from "./detectors/debarredRecipient";
import { assembleGeneralCase, generalCaseToInsert, renderGeneralCase } from "./generalCase";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

const exclusions: ExclusionRecord[] = [
  {
    name: "Acme Corp",
    uei: "ABC123",
    classification: "Firm",
    exclusionType: "Ineligible (Proceedings Completed)",
    activationDate: "2020-01-01",
    terminationDate: "Indefinite",
  },
];
const index = buildExclusionIndex(exclusions);

const awards: AwardRecord[] = [
  {
    awardId: "CONT_AWD_1",
    recipientName: "ACME CORPORATION",
    recipientId: "x",
    amount: 2_000_000,
    awardingAgency: "Department of Defense",
    startDate: "2021-06-01",
    endDate: "2023-06-01",
    category: "contracts",
  },
  {
    awardId: "CONT_AWD_2",
    recipientName: "Clean Industries LLC",
    recipientId: "y",
    amount: 500_000,
    awardingAgency: "NIH",
    startDate: "2021-06-01",
    endDate: "2022-06-01",
    category: "grants",
  },
];

const { signals, matches } = detectDebarredRecipients(awards, index);
check("exactly one debarred match (name-normalized Acme)", matches.length === 1);
check("clean recipient not flagged", !matches.some((m) => m.award.recipientName === "Clean Industries LLC"));
check("active-at-award true (indefinite exclusion)", matches[0].activeAtAward === true);
check("signal score == 75 (name45 + active25 + >1M 5)", signals[0].score === 75);
check("signal domain = general_federal_award", signals[0].domain === "general_federal_award");
check("signal carries subject name", signals[0].subjectName === "ACME CORPORATION");

const early: AwardRecord = { ...awards[0], startDate: "2019-01-01" };
check("pre-activation award is not active", activeAtAward(early, exclusions[0]) === false);

const gc = assembleGeneralCase(signals[0], { estimatedRecoveryUsd: 2_000_000 });
check("case maps to FCA program", gc.programs.some((p) => p.id === "fca"));
const insert = generalCaseToInsert(gc);
check("insert program = fca", insert.program === "fca");
check("insert reward = $500k (max 25% of $2M intervened)", insert.estimatedRewardUsd === 500_000);
const md = renderGeneralCase(gc);
check("render names the False Claims Act", md.includes("False Claims Act"));
check("render shows reward band", md.includes("est. reward"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
