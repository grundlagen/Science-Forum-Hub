// Reproducible assertions for the duplication-recognition agent (no network).
//   pnpm --filter @workspace/extrapolator run verify-dedupe
import {
  findDuplicateAwards,
  findNearDuplicateRecipients,
  recognizeDuplicates,
  nameSimilarity,
  type AwardLike,
  type RecipientLike,
} from "./dedupe";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

const awards: AwardLike[] = [
  { awardId: "A1", recipientName: "Acme Corp", amount: 500_000 },
  { awardId: "A2", recipientName: "ACME CORPORATION", amount: 500_000 },
  { awardId: "A3", recipientName: "Beta LLC", amount: 100_000 },
];
const dups = findDuplicateAwards(awards);
check("one duplicate-award group (Acme x2)", dups.length === 1);
check("duplicate_award kind + both ids", dups[0]?.kind === "duplicate_award" &&
  ["A1", "A2"].every((id) => (dups[0].evidence as { awardIds: string[] }).awardIds.includes(id)));
check("Beta not duplicated", !dups.some((s) => String(s.subjectName).toLowerCase().includes("beta")));

const recipients: RecipientLike[] = [
  { name: "Acme Corp" },
  { name: "Acme Corporation" },
  { name: "Zeta Labs" },
];
const near = findNearDuplicateRecipients(recipients);
check("one near-duplicate recipient pair", near.length === 1);
check("near-dup kind = shell_recipient", near[0]?.kind === "shell_recipient");
check("Zeta not flagged", !near.some((s) => String(s.subjectName).includes("Zeta")));

check("name similarity identical-after-normalize = 1", nameSimilarity("Acme Corp", "Acme Corporation") === 1);
check("name similarity distinct = 0", nameSimilarity("Acme", "Zeta") === 0);

const sharedAddr = findNearDuplicateRecipients([
  { name: "Alpha Holdings", address: "1 Main St" },
  { name: "Bravo Ventures", address: "1 Main St" },
]);
check("shared address triggers a pair", sharedAddr.length === 1);

const all = recognizeDuplicates({ awards, recipients });
check("agent returns both signal types, score-sorted", all.length === 2 && all[0].score >= all[1].score);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
