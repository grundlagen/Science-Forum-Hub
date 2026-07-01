// Stress test across the pure algorithms: empty/edge/large/adversarial inputs, score
// bounds, no-crash, and clean-data-produces-nothing. Complements the per-detector unit
// tests. No network.
//   pnpm --filter @workspace/extrapolator run verify-stress
import {
  findDuplicateAwards,
  findNearDuplicateRecipients,
  recognizeDuplicates,
  nameSimilarity,
  type AwardLike,
  type RecipientLike,
} from "./dedupe";
import { detectForeignFunding } from "./detectors/foreignFunding";
import { detectDebarredRecipients } from "./detectors/debarredRecipient";
import { buildExclusionIndex, type ExclusionRecord } from "@workspace/integration-sam-exclusions";
import type { AwardRecord } from "@workspace/integration-usaspending";
import { PROGRAMS, estimateReward } from "./programs";
import { parseReleasePackage, toAwardLike } from "@workspace/integration-ocds";
import type { DetectorSignal } from "./detectors/base";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}
const scoresValid = (sigs: DetectorSignal[]): boolean =>
  sigs.every((s) => Number.isFinite(s.score) && s.score >= 0 && s.score <= 100);

// 1. Empty inputs never crash and produce nothing.
check("empty dedupe", recognizeDuplicates({}).length === 0 && findDuplicateAwards([]).length === 0);
check("empty foreign-funding does not fire", detectForeignFunding([], []).fired === false);
check("empty debarred", detectDebarredRecipients([], buildExclusionIndex([])).signals.length === 0);

// 2. Large input completes and finds a single planted duplicate among 2000 clean awards.
const big: AwardLike[] = Array.from({ length: 2000 }, (_, i) => ({
  awardId: `U${i}`,
  recipientName: `Recipient ${i}`,
  amount: 1000 + i, // all distinct
}));
big.push({ awardId: "D1", recipientName: "Dup Co", amount: 500_000 });
big.push({ awardId: "D2", recipientName: "DUP CO", amount: 500_000 });
const bigDups = findDuplicateAwards(big);
check("large: exactly one planted duplicate found", bigDups.length === 1);
check("large: scores valid", scoresValid(bigDups));

// 3. Clean, all-distinct data produces zero signals.
const cleanRecips: RecipientLike[] = Array.from({ length: 60 }, (_, i) => ({ name: `Org ${1000 + i}` }));
check("clean recipients -> no near-duplicates", findNearDuplicateRecipients(cleanRecips).length === 0);

// 4. Adversarial / edge names never crash; similarity stays in [0,1].
const edge: RecipientLike[] = [
  { name: "" },
  { name: "   " },
  { name: "\u{1D518}\u{1D52B}\u{1D526}" },
  { name: "x".repeat(5000) },
  { name: "Émile & Co. (成都)" },
];
const edgeSignals = findNearDuplicateRecipients(edge);
check("edge names do not crash", Array.isArray(edgeSignals) && scoresValid(edgeSignals));
check("similarity bounded 0..1", (() => {
  const s = nameSimilarity("Émile & Co", "x".repeat(5000));
  return s >= 0 && s <= 1;
})());
check("empty-name similarity = 0", nameSimilarity("", "anything") === 0);

// 5. Score bounds on a mixed real-ish batch.
const mixed = recognizeDuplicates({
  awards: [
    { awardId: "A1", recipientName: "Alpha Co", amount: 2_000_000 },
    { awardId: "A2", recipientName: "Alpha Corporation", amount: 2_000_000 },
  ],
  recipients: [{ name: "Alpha Co" }, { name: "Alpha Corporation" }],
});
check("mixed batch scores valid", mixed.length >= 1 && scoresValid(mixed));

// 6. Foreign-funding + debarred on larger inputs stay bounded.
const ff = detectForeignFunding(
  [{ coreProjectNum: "R01", startYear: 2018, endYear: 2022 }],
  Array.from({ length: 500 }, (_, i) => ({
    type: "foreign_affiliation" as const,
    country: i % 2 ? "CN" : "GB",
    label: `Inst ${i}`,
    workYear: 2020,
    workRef: `W${i}`,
  })),
);
check("foreign-funding large: fired boolean + score bounded", typeof ff.fired === "boolean" && ff.score >= 0 && ff.score <= 100);

const exIndex = buildExclusionIndex([
  { name: "Bad Co", uei: null, classification: null, exclusionType: "x", activationDate: "2020-01-01", terminationDate: "Indefinite" } as ExclusionRecord,
]);
const manyAwards: AwardRecord[] = Array.from({ length: 500 }, (_, i) => ({
  awardId: `C${i}`, recipientName: `Clean ${i}`, recipientId: null, amount: 1000, awardingAgency: "X",
  startDate: "2021-01-01", endDate: "2022-01-01", category: "contracts",
}));
manyAwards.push({ awardId: "CX", recipientName: "BAD CO", recipientId: null, amount: 2_000_000, awardingAgency: "X", startDate: "2021-01-01", endDate: "2022-01-01", category: "contracts" });
const deb = detectDebarredRecipients(manyAwards, exIndex);
check("debarred large: exactly one match, scores valid", deb.signals.length === 1 && scoresValid(deb.signals));

// 7. Program reward math stays bounded for every program.
check("estimateReward bounded for all programs", PROGRAMS.every((p) => {
  const r = estimateReward(p, 1_000_000_000);
  const z = estimateReward(p, 0);
  return r.minUsd <= r.maxUsd && r.maxUsd <= 1_000_000_000 && z.minUsd === 0 && z.maxUsd === 0;
}));

// 8. OCDS parser: sample package, empty package, and a planted cross-country duplicate.
const pkg = {
  releases: [
    { ocid: "ocds-a-1", buyer: { name: "Ministry X" }, date: "2022-01-01",
      awards: [{ id: "aw1", value: { amount: 100000, currency: "EUR" }, suppliers: [{ name: "Foo SA" }], date: "2022-02-01" }] },
    { ocid: "ocds-a-2", buyer: { name: "Ministry X" }, date: "2022-03-01",
      awards: [{ id: "aw2", value: { amount: 100000, currency: "EUR" }, suppliers: [{ name: "FOO SA" }], date: "2022-03-01" }] },
  ],
};
const rows = parseReleasePackage(pkg);
check("OCDS parse: two award rows", rows.length === 2 && rows[0].supplierName === "Foo SA");
check("OCDS empty package -> []", parseReleasePackage({}).length === 0);
const ocdsDups = findDuplicateAwards(rows.map(toAwardLike));
check("OCDS -> dedupe finds the cross-release duplicate", ocdsDups.length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
