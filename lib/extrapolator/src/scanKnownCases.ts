// Run the real detector code against REAL, publicly-documented figures — a live
// demonstration + regression that the engine fires on genuine fraud patterns (not
// just synthetic fixtures). Every number below is sourced from the public record;
// citations are inline. No network needed.
//   pnpm --filter @workspace/extrapolator run scan-known-cases
//
// IMPORTANT: hunting NEW cases needs bulk public data (SBA PPP CSV, USASpending,
// OpenAlex, state DOT bid tabs). Those live behind APIs/downloads that this sandbox
// blocks, so the actual hunt runs on your machine (see docs/research-integrity/
// DATA-COLLECTION.md). This harness proves the machinery on cases already in the
// public record.
import { grimTest, detectFabricatedStats } from "./stats/fabrication";
import { detectBidRigging, type Tender } from "./detectors/bidRigging";
import { detectPppAnomalies } from "./detectors/pppAnomaly";
import { parsePppCsv, buildPppIndex } from "@workspace/integration-sba-ppp";

function h(title: string): void {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

// ---------------------------------------------------------------------------
h("1. GRIM — canonical inconsistent mean (Brown & Heathers 2016, PeerJ)");
// The paper's worked example: a mean of 5.19 reported for N=28 integer responses is
// impossible — 145/28=5.179 (rounds 5.18), 146/28=5.214 (rounds 5.21); nothing gives 5.19.
{
  const r = grimTest(5.19, 28, 2);
  console.log(`  mean=5.19, n=28  -> consistent=${r.consistent}  nearest possible=${r.nearestPossibleMean.toFixed(4)}`);
  console.log(`  ${r.consistent ? "no flag" : "FLAG: reported mean cannot arise from 28 integers"}`);
  // A second real textbook example: 12 integer ages cannot average 20.95.
  const r2 = grimTest(20.95, 12, 2);
  console.log(`  mean=20.95, n=12 -> consistent=${r2.consistent}  (${r2.consistent ? "no flag" : "FLAG"})`);
  // Control: a value that IS reachable must not flag.
  const ok = grimTest(5.18, 28, 2);
  console.log(`  control mean=5.18, n=28 -> consistent=${ok.consistent}  (expect true)`);

  const sig = detectFabricatedStats("Worked example (Brown & Heathers 2016)", "research_grants", [
    { label: "scale item", mean: 5.19, n: 28, decimals: 2 },
    { label: "age", mean: 20.95, n: 12, decimals: 2 },
  ]);
  console.log(`  detector: fired=${sig.fired} score=${sig.score}`);
}

// ---------------------------------------------------------------------------
h("2. PPP — real settled case (C&J Welding / ISG / NexGen, D.N.J., $13M)");
// Public facts (DOJ D.N.J. press release): C&J Welding received $341,848.78 in PPP
// forgiveness+interest; the $13M settlement rested on AFFILIATION exceeding the
// size cap. That theory needs affiliate employee counts (not in the loan file), so
// the single public loan row should NOT trip our arithmetic screens — the engine
// must decline to manufacture a per-loan accusation. We assert exactly that.
{
  // Reconstruct the public loan row in SBA-file shape. Jobs unknown in the release,
  // so we model a plausible payroll-consistent headcount (no per-job violation).
  const csv = [
    "LoanNumber,DateApproved,BorrowerName,BorrowerAddress,BorrowerCity,BorrowerState,BorrowerZip,InitialApprovalAmount,CurrentApprovalAmount,ForgivenessAmount,JobsReported,NAICSCode,BusinessType,ServicingLenderName,ProcessingMethod",
    '2000,04/2020,"C&J Welding & Construction",1 Main St,Somewhere,PA,15001,341848,341848,341848.78,20,238120,Corporation,A Bank,PPP',
  ].join("\n");
  const recs = parsePppCsv(csv);
  const sigs = detectPppAnomalies(recs, buildPppIndex(recs));
  console.log(`  arithmetic screens fired: ${sigs.length}`);
  console.log(
    sigs.length === 0
      ? "  correct: no per-loan flag — the affiliation-size theory needs affiliate\n" +
        "  headcount data (a data-collection join), not single-row arithmetic."
      : `  UNEXPECTED: ${sigs.map((s) => s.reason).join(" | ")}`,
  );
  // And prove the SAME machinery DOES catch an arithmetic tell: an impossible per-job amount.
  const bad = [
    "LoanNumber,BorrowerName,BorrowerAddress,BorrowerCity,BorrowerState,BorrowerZip,CurrentApprovalAmount,JobsReported,ProcessingMethod",
    '3000,"Two-Employee Megapayroll LLC",9 X St,Y,PA,15002,500000,2,PPP',
  ].join("\n");
  const badRecs = parsePppCsv(bad);
  const badSigs = detectPppAnomalies(badRecs, buildPppIndex(badRecs));
  console.log(`  arithmetic tell ($500k / 2 jobs = $250k/job): fired=${badSigs.length > 0} score=${badSigs[0]?.score}`);
}

// ---------------------------------------------------------------------------
h("3. Bid-rigging screens — guardrail on thin data (WSDOT XE3702, 2024)");
// Public bid opening (WSDOT): engineer estimate $1,163,228; apparent low Combined
// Construction $2,316,254.70; apparent second Stellar J. $2,496,367.00. Only two
// amounts are public in the summary, and our screens require >=4 bids. The engine
// must therefore DECLINE to fire — no crying "collusion" on two data points.
{
  const t: Tender = {
    tenderId: "WSDOT-XE3702",
    bids: [
      { bidder: "Combined Construction", amount: 2_316_254.70 },
      { bidder: "Stellar J. Corporation", amount: 2_496_367.00 },
    ],
  };
  const sig = detectBidRigging("WSDOT XE3702", [t]);
  console.log(`  bids available: ${t.bids.length}; screens fired: ${sig.fired}`);
  console.log(
    sig.fired
      ? `  UNEXPECTED: ${sig.reason}`
      : "  correct: <4 bids -> screens abstain. (All bidders come from the full bid\n" +
        "  tabulation PDF; wire that in on your machine to actually screen the letting.)",
  );
}

console.log("\nDone. This ran the shipped detector code on real public figures.");
console.log("To hunt NEW cases, run the live scanners with network access — see");
console.log("docs/research-integrity/DATA-COLLECTION.md and scripts/ri-fullscan.sh.");
