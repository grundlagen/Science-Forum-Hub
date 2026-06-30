// Reproducible assertions for the whistleblower-program registry (no network).
//   pnpm --filter @workspace/extrapolator run verify-programs
import { PROGRAMS, getProgram, programsForDomain, estimateReward } from "./programs";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

const fca = getProgram("fca")!;
const sec = getProgram("sec")!;

check("registry has the core programs", PROGRAMS.length >= 6 && !!fca && !!sec);

const fcaIntervened = estimateReward(fca, 10_000_000);
check("FCA intervened = 15–25% (1.5M–2.5M)", fcaIntervened.minUsd === 1_500_000 && fcaIntervened.maxUsd === 2_500_000);

const fcaDeclined = estimateReward(fca, 10_000_000, { governmentDeclined: true });
check("FCA declined = 25–30% (2.5M–3M)", fcaDeclined.minUsd === 2_500_000 && fcaDeclined.maxUsd === 3_000_000);

const secSmall = estimateReward(sec, 500_000);
check("SEC below $1M threshold does not qualify", secSmall.qualifies === false);
const secBig = estimateReward(sec, 5_000_000);
check("SEC above threshold qualifies (10–30%)", secBig.qualifies && secBig.minUsd === 500_000 && secBig.maxUsd === 1_500_000);

check("securities domain maps to SEC", programsForDomain("securities").some((p) => p.id === "sec"));
check("research_grants maps to FCA", programsForDomain("research_grants").some((p) => p.id === "fca"));
check("general_federal_award maps to FCA", programsForDomain("general_federal_award").some((p) => p.id === "fca"));
check("IRS threshold is $2M", getProgram("irs")!.rewardThresholdUsd === 2_000_000);

// qui tam is US-only; the new US programs exist; jurisdiction filtering works.
check("FCA is qui tam, SEC is not", fca.isQuiTam === true && sec.isQuiTam === false);
check("DOJ corporate pilot present, not qui tam", getProgram("doj_corporate")?.isQuiTam === false);
check("DOJ antitrust covers bid rigging", programsForDomain("antitrust_bid_rigging").some((p) => p.id === "doj_antitrust"));
check("tax default = US only (IRS, not HMRC/CRA/NTS)", programsForDomain("tax").every((p) => p.jurisdiction === "US"));
check(
  "tax {all} includes non-US tip-reward programs",
  ["uk_hmrc", "ca_cra_otip", "kr_nts"].every((id) =>
    programsForDomain("tax", { jurisdiction: "all" }).some((p) => p.id === id),
  ),
);
check("only US/state FCA are qui tam", PROGRAMS.filter((p) => p.isQuiTam).every((p) => p.jurisdiction === "US"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
