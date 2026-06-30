// Healthcare scanner: screen a provider NPI against the OIG LEIE exclusion list using
// CMS payment data.
//   pnpm --filter @workspace/extrapolator run scan-provider -- \
//     --npi 1234567890 --leie /path/to/LEIE.csv --cms-dataset <datasetId> [--year 2022] \
//     [--scale small|large|individual] [--public-benefit "note"]
//
// Needs outbound access to data.cms.gov. LEIE CSV is the public OIG download (no key).
import { readFileSync } from "node:fs";
import { parseLeieCsv, buildLeieIndex } from "@workspace/integration-oig-leie";
import { getPartDByNpi } from "@workspace/integration-cms";
import { detectExcludedProviders } from "./detectors/excludedProvider";
import { assembleGeneralCase, renderGeneralCase } from "./generalCase";
import type { EntityScale } from "./triage";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const npi = arg("npi");
  const leiePath = arg("leie");
  const datasetId = arg("cms-dataset");
  const year = arg("year") ? Number(arg("year")) : undefined;
  if (!npi || !leiePath) {
    console.error('usage: ... run scan-provider -- --npi <NPI> --leie <LEIE.csv> --cms-dataset <id> [--year YYYY]');
    process.exit(1);
  }

  const index = buildLeieIndex(parseLeieCsv(readFileSync(leiePath, "utf8")));
  console.log(`# NPI ${npi}`);
  console.log(`LEIE records loaded: ${index.byNpi.size} NPIs / ${index.byName.size} names`);

  if (!datasetId) {
    console.log("(pass --cms-dataset <id> for the Medicare Part D Prescribers dataset to fetch payments)");
    process.exit(0);
  }
  const payments = await getPartDByNpi(npi, { datasetId, year });
  console.log(`CMS payment rows: ${payments.length}`);

  const { signals } = detectExcludedProviders(payments, index);
  if (signals.length === 0) {
    console.log("No excluded-provider signals above threshold.");
    process.exit(0);
  }
  for (const s of signals) {
    const ev = s.evidence as { payment?: { amountUsd?: number | null } };
    const gc = assembleGeneralCase(s, {
      estimatedRecoveryUsd: ev.payment?.amountUsd ?? undefined,
      entityScale: (arg("scale") as EntityScale | undefined) ?? undefined,
      publicBenefitNote: arg("public-benefit") ?? undefined,
    });
    console.log("\n" + renderGeneralCase(gc));
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
