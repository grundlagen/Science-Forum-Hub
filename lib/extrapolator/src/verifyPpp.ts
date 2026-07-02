// Reproducible assertions for the SBA PPP connector + anomaly detector (no network).
//   pnpm --filter @workspace/extrapolator run verify-ppp
import { parsePppCsv, buildPppIndex } from "@workspace/integration-sba-ppp";
import { detectPppAnomalies, findPppAnomalies, MAX_PER_JOB } from "./detectors/pppAnomaly";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

const csv = [
  "LoanNumber,DateApproved,BorrowerName,BorrowerAddress,BorrowerCity,BorrowerState,BorrowerZip,InitialApprovalAmount,CurrentApprovalAmount,ForgivenessAmount,JobsReported,NAICSCode,BusinessType,ServicingLenderName,ProcessingMethod",
  // Clean small business: 10 jobs, $150k -> $15k/job, forgiven in full.
  '1001,04/15/2020,"Good Bakery LLC",1 Flour St,Austin,TX,78701,150000,150000,151200,10,722511,LLC,First Bank,PPP',
  // Per-job violation: 2 jobs claimed, $500k -> $250k/job.
  '1002,05/02/2020,"Ghost Staffing Inc",9 Vapor Ave,Dallas,TX,75001,500000,500000,,2,561320,Corporation,First Bank,PPP',
  // Excess draws: three loans, same name + address.
  '1003,04/20/2020,"Triple Dip Co",7 Same Pl,Houston,TX,77002,80000,80000,,5,238160,LLC,Alt Lender,PPP',
  '1004,02/10/2021,"Triple Dip Co",7 Same Pl,Houston,TX,77002,80000,80000,,5,238160,LLC,Alt Lender,PPS',
  '1005,03/12/2021,"Triple Dip Co",7 Same Pl,Houston,TX,77002,80000,80000,,5,238160,LLC,Alt Lender,PPS',
  // Forgiveness overrun: forgiven far above approval.
  '1006,04/25/2020,"Overforgiven LLC",3 Bonus Rd,El Paso,TX,79901,100000,100000,150000,8,541511,LLC,First Bank,PPP',
].join("\n");

const records = parsePppCsv(csv);
check("parses all rows", records.length === 6);
check("amounts parsed as numbers", records[0].initialApprovalAmount === 150_000);
check("jobs parsed", records[1].jobsReported === 2);

const index = buildPppIndex(records);
check("name index built", (index.byName.get("good bakery")?.length ?? 0) === 1);
check("address groups triple-dipper", (index.byAddress.get("7 same pl houston tx 77002")?.length ?? 0) === 3);

const anomalies = findPppAnomalies(records, index);
check("per-job violation found (only the ghost)", anomalies.perJobViolations.length === 1);
check("per-job violator identified", anomalies.perJobViolations[0].loan.borrowerName === "Ghost Staffing Inc");
check("per-job math right", anomalies.perJobViolations[0].perJob === 250_000 && 250_000 > MAX_PER_JOB);
check("excess draws found", anomalies.excessDraws.length === 1 && anomalies.excessDraws[0].loans.length === 3);
check("forgiveness overrun found (interest slack respected)", anomalies.forgivenessOverruns.length === 1);
check("clean bakery not flagged for slight overrun", anomalies.forgivenessOverruns[0].loan.borrowerName === "Overforgiven LLC");

const signals = detectPppAnomalies(records, index);
check("one signal per anomaly", signals.length === 3);
check("all signals fired with bounded scores", signals.every((s) => s.fired && s.score > 0 && s.score <= 100));
check("all signals carry ppp domain", signals.every((s) => s.domain === "ppp_covid_relief"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
