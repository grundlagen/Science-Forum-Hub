// Reproducible assertions for the pass-through / set-aside front detector (no network).
//   pnpm --filter @workspace/extrapolator run verify-pass-through
import { detectPassThroughFront, findFrontIndicators } from "./detectors/passThroughFront";
import type { EntityIdentity } from "./detectors/passThroughFront";
import type { SubawardRecord } from "@workspace/integration-usaspending";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

const subaward = (
  id: string,
  sub: string,
  prime: string,
  amount: number,
  primeAwardId: string,
): SubawardRecord => ({
  subAwardId: id,
  subRecipientName: sub,
  amount,
  actionDate: "2023-05-01",
  primeAwardId,
  primeRecipientName: prime,
  awardingAgency: "DOT",
});

const prime: EntityIdentity = {
  name: "BigBuild Corp",
  address: "100 Main St, Columbus OH",
  officers: ["John Smith", "Mary Jones"],
};

// 1. A legitimate sub (own address/officers, scoped slice, several primes) does not fire.
const honestSub: EntityIdentity = { name: "Steelworks LLC", address: "9 Iron Rd, Dayton OH", officers: ["Ann Ho"] };
const honestSubawards = [
  subaward("s1", "Steelworks LLC", "BigBuild Corp", 200_000, "A1"),
  subaward("s2", "Steelworks LLC", "OtherPrime Inc", 150_000, "B1"),
];
const honestAmounts = new Map([["A1", 2_000_000], ["B1", 1_500_000]]);
const honest = detectPassThroughFront(prime, honestSub, honestSubawards, honestAmounts);
check("legitimate sub does not fire", honest.fired === false);

// 2. Classic front: shared address + shared officer + high pass-through + captive.
const frontSub: EntityIdentity = {
  name: "MinorityWorks LLC",
  address: "100 Main st Columbus, OH", // same place, different formatting
  officers: ["John Smith"],
};
const frontSubawards = [
  subaward("f1", "MinorityWorks LLC", "BigBuild Corp", 1_600_000, "A1"),
  subaward("f2", "MinorityWorks LLC", "BigBuild Corp", 900_000, "A2"),
  subaward("f3", "MinorityWorks LLC", "BigBuild Corp", 700_000, "A3"),
  subaward("f4", "MinorityWorks LLC", "BigBuild Corp", 500_000, "A4"),
];
const frontAmounts = new Map([["A1", 2_000_000], ["A2", 1_000_000], ["A3", 800_000], ["A4", 600_000]]);
const front = detectPassThroughFront(prime, frontSub, frontSubawards, frontAmounts);
check("classic front fires", front.fired === true);
check("classic front scores high", front.score >= 70);

const ind = findFrontIndicators(prime, frontSub, frontSubawards, frontAmounts);
check("shared address detected despite formatting", ind.sharedAddress === true);
check("shared officer detected", ind.sharedOfficers.length === 1);
check("pass-through awards detected", ind.passThroughAwards.length === 4);
check("captivity detected", ind.exclusiveSubAwards === 4);

// 3. One indicator alone (exclusivity only) does not fire — small subs often have one client.
const captiveOnly: EntityIdentity = { name: "SoloSub LLC", address: "5 Oak Ave, Toledo OH", officers: ["Pat Lee"] };
const captiveSubawards = [
  subaward("c1", "SoloSub LLC", "BigBuild Corp", 100_000, "A1"),
  subaward("c2", "SoloSub LLC", "BigBuild Corp", 120_000, "A2"),
  subaward("c3", "SoloSub LLC", "BigBuild Corp", 90_000, "A3"),
  subaward("c4", "SoloSub LLC", "BigBuild Corp", 80_000, "A4"),
];
const captive = detectPassThroughFront(prime, captiveOnly, captiveSubawards, frontAmounts);
check("exclusivity alone does not fire", captive.fired === false);

// 4. Score bounded.
check("score bounded 0..100", front.score <= 100 && honest.score === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
