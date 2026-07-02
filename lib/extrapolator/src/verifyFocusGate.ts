// Reproducible assertions for the FOCUS pre-filing readiness gate (no network).
//   pnpm --filter @workspace/extrapolator run verify-focus-gate
import { assessFocusReadiness, type CaseEvidenceProfile } from "./focusGate";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

// A thin, one-signal, no-diligence candidate: must be NOT ready.
const weak: CaseEvidenceProfile = {
  domain: "ppp_covid_relief",
  corroboratingDetectors: 1,
  validatedAgainstGroundTruth: false,
  namedEntities: 0,
  identifiedClaims: 0,
  hasDates: false,
  identityConfirmed: false,
  legitimateExplanationsConsidered: [],
  legitimateExplanationsRebutted: 0,
  citedProgramRules: [],
};
const wa = assessFocusReadiness(weak);
check("thin candidate is not_ready", wa.readiness === "not_ready");
check("thin candidate has gaps in every requirement", wa.requirements.every((r) => r.gaps.length > 0));
check("thin candidate scores low", wa.total < 30);

// A fully worked-up matter: all four bars met.
const strong: CaseEvidenceProfile = {
  domain: "ppp_covid_relief",
  corroboratingDetectors: 2,
  validatedAgainstGroundTruth: true,
  namedEntities: 1,
  identifiedClaims: 3,
  hasDates: true,
  identityConfirmed: true,
  legitimateExplanationsConsidered: ["temp-staffing headcount", "affiliate sharing address"],
  legitimateExplanationsRebutted: 2,
  citedProgramRules: ["15 U.S.C. 636(a)(36)", "PPP Interim Final Rule size standard"],
};
const sa = assessFocusReadiness(strong);
check("worked-up matter meets all four requirements", sa.requirements.every((r) => r.met));
check("worked-up matter is meeting-worthy", sa.readiness === "meeting_worth_counsel");
check("worked-up matter scores high", sa.total >= 90);

// Partial: good signal + particularity, but no innocent-explanation work -> developing, not ready.
const partial: CaseEvidenceProfile = {
  ...strong,
  legitimateExplanationsConsidered: [],
  legitimateExplanationsRebutted: 0,
  citedProgramRules: ["15 U.S.C. 636"],
};
const pa = assessFocusReadiness(partial);
check("partial matter is not meeting-worthy", pa.readiness !== "meeting_worth_counsel");
check("partial matter names the missing innocent-explanation work", pa.requirements[2].gaps.length > 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
