// Reproducible assertions for the peer-review checker framework (no network).
//   pnpm --filter @workspace/extrapolator run verify-peer-review
import { runPeerReview, allCheckers, type Manuscript } from "./peerReview";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

async function main(): Promise<void> {
  // A manuscript that trips three native checkers.
  const dirty: Manuscript = {
    id: "ms-001",
    title: "A study",
    nhstResults: [
      { type: "t", df1: 20, statistic: 1.5, comparator: "<", reportedP: 0.05 }, // decision inconsistency
    ],
    reportedStats: [{ label: "age", mean: 5.19, n: 28, decimals: 2 }], // GRIM-impossible
    references: [
      { raw: "Smith 2020", doi: "10.1000/abc" },
      { raw: "Smith 2020 again", doi: "10.1000/abc" }, // duplicate
    ],
  };
  const report = await runPeerReview(dirty, allCheckers()); // external all unconfigured

  const byId = Object.fromEntries(report.results.map((r) => [r.checker, r]));
  check("statcheck flagged a major (decision) inconsistency", byId["statcheck"].flags.some((f) => f.severity === "major"));
  check("fabrication flagged the impossible mean", byId["fabrication-stats"].flags.some((f) => f.severity === "major"));
  check("reference-sanity flagged the duplicate DOI", byId["reference-sanity"].flags.length >= 1);
  check("overall recommendation is needs_human_review", report.recommendation === "needs_human_review");

  // External engines are present but skipped (unconfigured) — not failed, not fabricated.
  const imagetwin = byId["imagetwin"];
  check("imagetwin adapter present", imagetwin !== undefined);
  check("imagetwin adapter reports unavailable (not configured)", imagetwin.available === false && imagetwin.ran === false);
  check("unconfigured external adapters raise no flags", report.results.filter((r) => !r.available).every((r) => r.flags.length === 0));

  // A clean manuscript screens clean.
  const clean: Manuscript = {
    id: "ms-002",
    nhstResults: [{ type: "t", df1: 20, statistic: 2.086, comparator: "=", reportedP: 0.05 }],
    reportedStats: [{ label: "age", mean: 5.18, n: 28, decimals: 2 }],
    references: [{ raw: "Jones 2019", doi: "10.1000/xyz" }],
  };
  const cleanReport = await runPeerReview(clean, allCheckers());
  check("clean manuscript screens clean", cleanReport.recommendation === "clean");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
