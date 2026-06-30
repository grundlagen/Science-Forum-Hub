// General-funding scanner: screen a federal-award recipient against SAM debarment.
//   pnpm --filter @workspace/extrapolator run scan-recipient -- "Acme Corp" \
//     --exclusions /path/to/SAM_Exclusions_Public_Extract.csv
//
// Needs outbound access to api.usaspending.gov. The exclusions CSV is the public
// SAM.gov extract (no API key). Output is probable cause for review.
import { readFileSync } from "node:fs";
import { searchAwardsByRecipient } from "@workspace/integration-usaspending";
import { parseExclusionsCsv, buildExclusionIndex } from "@workspace/integration-sam-exclusions";
import { detectDebarredRecipients } from "./detectors/debarredRecipient";
import { assembleGeneralCase, renderGeneralCase } from "./generalCase";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const name = process.argv
    .slice(2)
    .filter((a) => !a.startsWith("--"))
    .join(" ")
    .trim();
  const csv = arg("exclusions");
  if (!name) {
    console.error('usage: ... run scan-recipient -- "<recipient>" --exclusions <SAM csv>');
    process.exit(1);
  }

  const awards = await searchAwardsByRecipient(name, { limit: 50 });
  console.log(`# ${name}`);
  console.log(`Federal awards found: ${awards.length}`);

  if (!csv) {
    console.log("(pass --exclusions <SAM_Exclusions_Public_Extract.csv> to screen against debarment)");
    process.exit(0);
  }

  const exclusions = parseExclusionsCsv(readFileSync(csv, "utf8"));
  const index = buildExclusionIndex(exclusions);
  console.log(`Exclusion records loaded: ${exclusions.length}`);

  const { signals } = detectDebarredRecipients(awards, index);
  if (signals.length === 0) {
    console.log("No debarred-recipient signals above threshold.");
    process.exit(0);
  }
  for (const s of signals) {
    const ev = s.evidence as { award?: { amount?: number | null } };
    const gc = assembleGeneralCase(s, { estimatedRecoveryUsd: ev.award?.amount ?? undefined });
    console.log("\n" + renderGeneralCase(gc));
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
