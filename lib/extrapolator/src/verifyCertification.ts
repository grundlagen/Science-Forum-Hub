// Reproducible assertions for the certification-chain logic (no network).
//   pnpm --filter @workspace/extrapolator run verify-certification
import { buildCertificationChain } from "./certification";
import { enrichGrantRefs } from "./paperGrants";
import type { ReporterProject } from "@workspace/integration-nih-reporter";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

// 1. Image signal + 2 grants + senior author is PI -> oversight + allowable certs, high confidence.
const c1 = buildCertificationChain({
  work: { ref: "W:img1", correspondingAuthor: "Senior PI", seniorAuthorIsPi: true },
  grants: [{ coreProjectNum: "R01CA000001" }, { coreProjectNum: "R01CA000002" }],
  signalKind: "image_duplication",
  signalScore: 80,
});
check("1 linked", c1.linked);
check("1 oversight undermined", c1.oversightUndermined);
check("1 implies pi_oversight + allowable_expenses", c1.impliedFalseCertifications.includes("pi_oversight") && c1.impliedFalseCertifications.includes("allowable_expenses"));
check("1 confidence == 80 (2-grant linkage => full strength)", c1.confidence === 80);

// 2. Foreign-funding signal -> full_disclosure cert; single grant halves linkage strength.
const c2 = buildCertificationChain({
  work: { ref: "W:ff1" },
  grants: [{ coreProjectNum: "R01HL000003" }],
  signalKind: "foreign_funding_mismatch",
  signalScore: 60,
});
check("2 implies full_disclosure", c2.impliedFalseCertifications.includes("full_disclosure"));
check("2 single-grant confidence == 45 (60 * 0.75)", c2.confidence === 45);

// 3. No grant linkage -> theory unsupported, confidence 0.
const c3 = buildCertificationChain({
  work: { ref: "W:none" },
  grants: [],
  signalKind: "image_duplication",
  signalScore: 90,
});
check("3 unlinked => not linked", !c3.linked);
check("3 unlinked => confidence 0", c3.confidence === 0);
check("3 unlinked => no certifications", c3.impliedFalseCertifications.length === 0);

// 4. enrichGrantRefs fills PI / institution / period from fetched projects.
const projects: ReporterProject[] = [
  {
    core_project_num: "R01CA000001",
    project_start_date: "2018-01-01",
    project_end_date: "2022-12-31",
    principal_investigators: [{ full_name: "Jane Doe" }],
    organization: { org_name: "Test University" },
  } as ReporterProject,
];
const enriched = enrichGrantRefs([{ coreProjectNum: "R01CA000001" }], projects);
check("4 enrich sets PI", enriched[0].piName === "Jane Doe");
check("4 enrich sets institution", enriched[0].institution === "Test University");
check("4 enrich sets years", enriched[0].startYear === 2018 && enriched[0].endYear === 2022);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
