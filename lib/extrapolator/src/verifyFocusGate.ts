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

// Synthetic worked-up matter; document references are test fixtures only.
const strong: CaseEvidenceProfile = {
  claimFalsityEvidence: ["fixture: application contradicts dated underlying record"],
  knowledgeEvidence: ["fixture: pre-submission warning acknowledged"],
  materialityEvidence: ["fixture: payment condition and agency response"],
  programRuleAppliesToClaim: true,
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

for (const field of ["identityConfirmed", "hasDates"] as const) {
  const a = assessFocusReadiness({ ...strong, [field]: false });
  check(field + " cannot be offset by other points", a.readiness !== "meeting_worth_counsel");
}
for (const field of ["claimFalsityEvidence", "knowledgeEvidence", "materialityEvidence"] as const) {
  for (const value of [undefined, [], ["  "]]) {
    const a = assessFocusReadiness({ ...strong, [field]: value });
    check(field + " missing/empty blocks promotion", a.readiness !== "meeting_worth_counsel");
  }
}
check("wrong-date rule blocks promotion", assessFocusReadiness({ ...strong, programRuleAppliesToClaim: false }).readiness !== "meeting_worth_counsel");
check("settled benchmark blocks promotion", assessFocusReadiness({ ...strong, knownResolvedMatter: true }).readiness !== "meeting_worth_counsel");
check("missing entity blocks particularity", !assessFocusReadiness({ ...strong, namedEntities: 0 }).requirements[1].met);
check("missing claim blocks particularity", !assessFocusReadiness({ ...strong, identifiedClaims: 0 }).requirements[1].met);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
