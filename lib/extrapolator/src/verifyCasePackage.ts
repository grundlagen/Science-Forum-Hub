// Reproducible assertions for case assembly + export (no network, no DB).
//   pnpm --filter @workspace/extrapolator run verify-case-package
import { buildCertificationChain } from "./certification";
import { assembleCase, casePackageToInsert, renderCasePackage } from "./casePackage";
import type { DetectorSignal } from "./detectors/base";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

const signal: DetectorSignal = {
  kind: "foreign_funding_mismatch",
  detector: "foreign-funding/v1",
  fired: true,
  score: 72,
  reason: "2 foreign-support item(s) from CN concurrent with NIH award R01HL000003.",
  evidence: [{ country: "CN", label: "Fudan University", workYear: 2020 }],
};

const chain = buildCertificationChain({
  work: { ref: "W:demo", correspondingAuthor: "Dr. Example", seniorAuthorIsPi: true },
  grants: [
    { coreProjectNum: "R01HL000003", piName: "Dr. Example", institution: "Example University", startYear: 2018, endYear: 2022 },
  ],
  signalKind: signal.kind,
  signalScore: signal.score,
});

const pkg = assembleCase({
  signal,
  chain,
  researcherName: "Dr. Example",
  now: new Date("2026-06-30T00:00:00Z"),
});

check("title includes researcher + signal kind", pkg.title === "Dr. Example — foreign_funding_mismatch");
check("default disclosure state is internal", pkg.disclosureState === "internal");
check("confidence mirrors chain confidence", pkg.confidence === chain.confidence);
check("generatedAt is ISO", pkg.generatedAt === "2026-06-30T00:00:00.000Z");

const insert = casePackageToInsert(pkg);
check("insert carries title", insert.title === pkg.title);
check("insert carries disclosure state", insert.disclosureState === "internal");
check("insert summary == narrative", insert.summary === chain.narrative);

const md = renderCasePackage(pkg);
check("render has header", md.includes("# Case package: Dr. Example — foreign_funding_mismatch"));
check("render has not-legal-advice rail", md.includes("Not legal advice"));
check("render lists the grant", md.includes("R01HL000003"));
check("render shows certification chain", md.includes("full_disclosure"));
check("render shows counterfactual", md.includes("But for the compromised research"));

console.log("\n----- sample rendered package -----\n");
console.log(md);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
