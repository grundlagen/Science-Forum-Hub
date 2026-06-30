// Reproducible assertions: excluded-provider detector + triage + general case (no network).
//   pnpm --filter @workspace/extrapolator run verify-excluded-provider
import { buildLeieIndex, type ExcludedProvider } from "@workspace/integration-oig-leie";
import type { ProviderPaymentRecord } from "@workspace/integration-cms";
import { detectExcludedProviders, paymentAfterExclusion } from "./detectors/excludedProvider";
import { assembleGeneralCase, renderGeneralCase } from "./generalCase";
import { triage } from "./triage";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

const leie: ExcludedProvider[] = [
  {
    name: "John Smith",
    npi: "1234567890",
    exclType: "1128(a)(1)",
    exclDateIso: "2018-08-15",
    reinDateIso: null,
    state: "CA",
  },
];
const index = buildLeieIndex(leie);

const payments: ProviderPaymentRecord[] = [
  { npi: "1234567890", providerName: "SMITH JOHN", program: "medicare_part_d", amountUsd: 250_000, year: 2020 },
  { npi: "9999999999", providerName: "Clean Clinic", program: "medicare_part_d", amountUsd: 50_000, year: 2020 },
];

const { signals, matches } = detectExcludedProviders(payments, index);
check("one excluded-provider match (by NPI)", matches.length === 1 && matches[0].matchType === "npi");
check("clean NPI not flagged", !matches.some((m) => m.payment.npi === "9999999999"));
check("payment after exclusion detected", matches[0].afterExclusion === true);
check("score == 90 (npi60 + after25 + >100k 5)", signals[0].score === 90);
check("domain = healthcare_billing", signals[0].domain === "healthcare_billing");

const reinstated: ExcludedProvider = { ...leie[0], reinDateIso: "2019-01-01" };
check(
  "payment after reinstatement is not flagged-active",
  paymentAfterExclusion({ ...payments[0], year: 2020 }, reinstated) === false,
);

check("low value -> hold", triage({ signalScore: 90, amountUsd: 50_000 }).recommendedAction === "hold_low_value");
check(
  "small entity -> notify first",
  triage({ signalScore: 90, amountUsd: 2_000_000, entityScale: "small" }).recommendedAction === "consider_notify_first",
);
check(
  "public benefit -> notify first",
  triage({ signalScore: 90, amountUsd: 2_000_000, publicBenefitNote: "supplies vaccines to clinics" }).recommendedAction ===
    "consider_notify_first",
);
check(
  "large + high value + strong -> escalate",
  triage({ signalScore: 80, amountUsd: 2_000_000, entityScale: "large" }).recommendedAction === "escalate",
);

const gc = assembleGeneralCase(signals[0], { estimatedRecoveryUsd: 250_000 });
check("case maps to FCA", gc.programs.some((p) => p.id === "fca"));
check("case carries a triage result", gc.triage.recommendedAction === "review");
const md = renderGeneralCase(gc);
check("render has Ethics & handling section", md.includes("Ethics & handling"));
check("render names the False Claims Act", md.includes("False Claims Act"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
