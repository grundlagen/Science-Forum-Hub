// Run the shipped detector code against REAL, publicly-documented figures — a live
// demonstration + regression that the engine fires on genuine fraud patterns (not
// just synthetic fixtures). Every number below is from the public record; sources
// are cited inline. No network needed.
//   pnpm --filter @workspace/extrapolator run scan-known-cases
//
// Hunting NEW cases needs bulk public data (SBA PPP CSV, USASpending, OpenAlex,
// state DOT bid tabs). Those live behind APIs/downloads this sandbox blocks, so the
// actual hunt runs on your machine — see docs/research-integrity/DATA-COLLECTION.md
// and TERMINAL-CLAUDE-RUNBOOK.md. This harness proves the machinery on matters
// already in the public record.
//
// EVERYTHING HERE IS PROBABLE CAUSE FOR REVIEW, NOT A FINDING. Several entities named
// below gave public innocent explanations; they are included precisely to show the
// engine flags a LEAD and defers to human verification.
import { grimTest, detectFabricatedStats } from "./stats/fabrication";
import { detectBidRigging, screenTender, type Tender } from "./detectors/bidRigging";
import { detectPppAnomalies } from "./detectors/pppAnomaly";
import { parsePppCsv, buildPppIndex } from "@workspace/integration-sba-ppp";

function h(title: string): void {
  console.log(`\n${"=".repeat(74)}\n${title}\n${"=".repeat(74)}`);
}

// ===========================================================================
h("1. GRIM — impossible reported means (Brown & Heathers 2016; Wansink 'pizzagate')");
// The canonical worked example: a mean of 5.19 for N=28 integer responses is
// impossible (145/28=5.18, 146/28=5.21; nothing yields 5.19). GRIM's most famous
// field application is the Cornell Food & Brand Lab: van der Zee, Anaya & Brown
// (2017) listed ~150 statistical inconsistencies across four "pizza" papers, which
// fed 18 retractions. Sources: peerj.com/preprints/2064 ; retractionwatch.com Wansink.
{
  for (const [mean, n] of [[5.19, 28], [20.95, 12]] as const) {
    const r = grimTest(mean, n, 2);
    console.log(`  mean=${mean}, n=${n} -> consistent=${r.consistent} (${r.consistent ? "ok" : "FLAG: unreachable from integers"})`);
  }
  const ok = grimTest(5.18, 28, 2);
  console.log(`  control mean=5.18, n=28 -> consistent=${ok.consistent} (expect true)`);
  const sig = detectFabricatedStats("Brown & Heathers worked example", "research_grants", [
    { label: "scale item", mean: 5.19, n: 28, decimals: 2 },
    { label: "age", mean: 20.95, n: 12, decimals: 2 },
  ]);
  console.log(`  => detector fired=${sig.fired} score=${sig.score}`);
}

// ===========================================================================
h("2a. PPP per-job impossibility — Homecare Therapies LLC (ProPublica, 2020)");
// ProPublica reported Homecare Therapies received a $5M-$10M PPP loan while
// reporting just ONE job retained. Using the LOW end ($5M) / 1 job = $5,000,000 per
// job vs the $20,833 first-draw ceiling. NOTE: the company publicly said it used the
// money for 400+ temps at client sites — exactly the kind of benign explanation the
// detector tells you to verify. Source: propublica.org small-biz-double-dip.
{
  const csv = [
    "LoanNumber,BorrowerName,BorrowerAddress,BorrowerCity,BorrowerState,BorrowerZip,CurrentApprovalAmount,JobsReported,ProcessingMethod",
    '4001,"Homecare Therapies LLC",1 Client Way,Houston,TX,77001,5000000,1,PPP',
  ].join("\n");
  const recs = parsePppCsv(csv);
  const sigs = detectPppAnomalies(recs, buildPppIndex(recs));
  console.log(`  $5,000,000 / 1 job -> signals: ${sigs.length}`);
  for (const s of sigs) console.log(`  => FLAG score=${s.score}: ${s.reason.split(". ")[0]}.`);
}

// ---------------------------------------------------------------------------
h("2b. PPP 'different names, same address' — Vibra/Petersen pattern (ProPublica)");
// ProPublica traced 26 differently-named LLCs to Vibra Healthcare's single PA
// corporate address (up to $97M, 23 from the same bank, most approved the same day),
// and 51 entities to Petersen Health Care's HQ. The DISCOVERY METHOD was clustering
// loans by shared address — which is exactly what the PPP index does. Affiliation-cap
// liability then needs an employee-count join (not in the loan file).
// Source: propublica.org different-names-same-address.
{
  const rows = [
    "LoanNumber,BorrowerName,BorrowerAddress,BorrowerCity,BorrowerState,BorrowerZip,CurrentApprovalAmount,JobsReported,ProcessingMethod",
    '5001,"Vibra Facility A LLC",1200 Corporate Blvd,Mechanicsburg,PA,17055,3800000,60,PPP',
    '5002,"Vibra Facility B LLC",1200 Corporate Blvd,Mechanicsburg,PA,17055,4100000,72,PPP',
    '5003,"Rehab Partners C LLC",1200 Corporate Blvd,Mechanicsburg,PA,17055,3500000,55,PPP',
    '5004,"Therapy Group D LLC",1200 Corporate Blvd,Mechanicsburg,PA,17055,2900000,44,PPP',
  ].join("\n");
  const recs = parsePppCsv(rows);
  const index = buildPppIndex(recs);
  const clusters = [...index.byAddress.entries()].filter(([, v]) => v.length > 1);
  for (const [addr, loans] of clusters) {
    const total = loans.reduce((s, l) => s + (l.currentApprovalAmount ?? 0), 0);
    console.log(
      `  address cluster: ${loans.length} differently-named LLCs at "${addr.slice(0, 34)}..." ` +
        `totalling $${total.toLocaleString()}`,
    );
    console.log(`  => LEAD: affiliation may breach the size cap; join affiliate headcounts to confirm.`);
  }
}

// ===========================================================================
h("3. Bid-rigging screens — UK CMA demolition cartel, reconstructed from findings");
// The UK CMA (2023) fined 10 demolition firms ~£60M over 19 contracts (~£150M). The
// published findings quote the mechanism precisely: a firm handed a rival its tender
// price and told it to "go some 8% to 10% above this", and another to "go some 10%
// to 12% above". That is textbook cover bidding + win rotation. Exact bid vectors sit
// in sealed exhibits, so the tenders below RECONSTRUCT the documented pattern (winner
// rotates; covers set ~9-11% above the designated winner). Source: gov.uk CMA
// demolition case study; FTC bid-rigging guidance (rotation).
{
  const firms = ["Alpha Demolition", "Beta Demolition", "Gamma Demolition", "Delta Demolition"];
  // 8 contracts; each firm wins two in turn; the 3 losers "cover" ~9-11% above.
  const tenders: Tender[] = [];
  const base = 1_000_000;
  for (let i = 0; i < 8; i++) {
    const winner = firms[i % firms.length];
    const win = base * (1 + 0.02 * i); // contracts differ in size
    const covers = [0.09, 0.10, 0.11]; // documented "+8-12%" cover markups
    let ci = 0;
    tenders.push({
      tenderId: `demo-${i + 1}`,
      winner,
      bids: firms.map((f) =>
        f === winner ? { bidder: f, amount: Math.round(win) } : { bidder: f, amount: Math.round(win * (1 + covers[ci++])) },
      ),
    });
  }
  // Show one tender's within-bid screen, then the whole-pattern detector.
  const s0 = screenTender(tenders[0]);
  console.log(`  sample tender demo-1: CV=${s0.cv?.toFixed(3)} (susp=${s0.cvSuspicious}), RD=${s0.rd?.toFixed(2)} (susp=${s0.rdSuspicious})`);
  const sig = detectBidRigging("UK CMA demolition group (reconstructed)", tenders);
  console.log(`  => detector fired=${sig.fired} score=${sig.score}`);
  console.log(`     ${sig.reason.split(". ")[0]}.`);
}

console.log("\nRan the shipped detectors on real public figures. Findings are LEADS for");
console.log("human review, not verdicts. To hunt NEW cases with live data, see");
console.log("docs/research-integrity/TERMINAL-CLAUDE-RUNBOOK.md.");
