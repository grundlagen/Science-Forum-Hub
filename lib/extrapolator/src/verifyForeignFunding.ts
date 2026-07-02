// Reproducible assertions for the de-biased foreign-funding detector (no network).
// Proves the score is COUNTRY-NEUTRAL and corroboration-driven.
//   pnpm --filter @workspace/extrapolator run verify-foreign-funding
import { detectForeignFunding } from "./detectors/foreignFunding";
import type { ForeignEvidence, NihAward } from "./extract";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

const awards: NihAward[] = [{ coreProjectNum: "R01", startYear: 2018, endYear: 2022 }];
const ev = (country: string, type: ForeignEvidence["type"], label: string): ForeignEvidence => ({
  type,
  country,
  label,
  workYear: 2020,
  workRef: `W:${label}`,
  grantLinked: false,
  isPiAffiliation: true,
});

// 1. COUNTRY-NEUTRAL: identical evidence differing only in country -> identical score.
const cn = detectForeignFunding(awards, [ev("CN", "foreign_affiliation", "Inst A")]);
const gb = detectForeignFunding(awards, [ev("GB", "foreign_affiliation", "Inst A")]);
const de = detectForeignFunding(awards, [ev("DE", "foreign_affiliation", "Inst A")]);
check("CN and GB single-item scores are equal", cn.score === gb.score);
check("CN and DE single-item scores are equal", cn.score === de.score);
check("no high-risk-country boost remains", cn.score === gb.score && gb.score === de.score);

// 2. Single uncorroborated item scores LOW and is flagged not-corroborated.
check("single item is low (<=30)", cn.score <= 30);
check("single item flagged uncorroborated", cn.corroboration.corroborated === false);

// 3. Corroboration RAISES score: two source-types + two entities > single item.
const corr = detectForeignFunding(awards, [
  ev("CN", "foreign_affiliation", "Inst A"),
  ev("CN", "foreign_funder", "Funder B"),
]);
check("corroborated (2 source-types) fires corroborated=true", corr.corroboration.corroborated === true);
check("corroborated score > single-item score", corr.score > cn.score);

// 4. Same corroboration, different country -> same score (neutrality holds under corroboration).
const corrGb = detectForeignFunding(awards, [
  ev("GB", "foreign_affiliation", "Inst A"),
  ev("GB", "foreign_funder", "Funder B"),
]);
check("corroborated score is country-neutral", corr.score === corrGb.score);

// 5. Non-concurrent evidence does not fire.
const old = detectForeignFunding(awards, [ev("CN", "foreign_affiliation", "Inst A")].map((e) => ({ ...e, workYear: 2005 })));
check("pre-award evidence does not fire", old.fired === false);

// 6. Score always bounded.
check("scores bounded 0..100", [cn, gb, de, corr, corrGb, old].every((s) => s.score >= 0 && s.score <= 100));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
