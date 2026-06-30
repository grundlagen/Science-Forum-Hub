// Sub-award scanner: screen a prime recipient's first-tier SUB-awards against SAM
// debarment (a prime passing federal money to an excluded sub).
//   pnpm --filter @workspace/extrapolator run scan-subawards -- "Prime Recipient Inc" \
//     --exclusions /path/to/SAM_Exclusions_Public_Extract.csv
//
// Needs outbound access to api.usaspending.gov. SAM exclusions CSV is the public extract.
import { readFileSync } from "node:fs";
import { searchSubawardsByRecipient } from "@workspace/integration-usaspending";
import { parseExclusionsCsv, buildExclusionIndex } from "@workspace/integration-sam-exclusions";
import { detectDebarredSubs } from "./detectors/debarredSub";
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
    console.error('usage: ... run scan-subawards -- "<prime recipient>" --exclusions <SAM csv>');
    process.exit(1);
  }

  const subawards = await searchSubawardsByRecipient(name, { limit: 100 });
  console.log(`# ${name}`);
  console.log(`First-tier sub-awards found: ${subawards.length}`);

  if (!csv) {
    console.log("(pass --exclusions <SAM_Exclusions_Public_Extract.csv> to screen subs against debarment)");
    process.exit(0);
  }
  const index = buildExclusionIndex(parseExclusionsCsv(readFileSync(csv, "utf8")));
  const { signals } = detectDebarredSubs(subawards, index);
  if (signals.length === 0) {
    console.log("No debarred-sub signals above threshold.");
    process.exit(0);
  }
  for (const s of signals) {
    const ev = s.evidence as { subaward?: { amount?: number | null } };
    const gc = assembleGeneralCase(s, { estimatedRecoveryUsd: ev.subaward?.amount ?? undefined });
    console.log("\n" + renderGeneralCase(gc));
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
