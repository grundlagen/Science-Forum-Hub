// CLI: run the foreign-funding detector for one PI.
//   pnpm --filter @workspace/extrapolator run detect-foreign-funding -- "Qing Wang" [--funders]
import { buildDossier } from "./dossier";
import { detectForeignFunding } from "./detectors/foreignFunding";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const piName = args.filter((a) => !a.startsWith("--")).join(" ").trim();
  if (!piName) {
    console.error('usage: ... run detect-foreign-funding -- "First Last" [--funders]');
    process.exit(1);
  }
  const dossier = await buildDossier(piName, {
    resolveFunderCountries: args.includes("--funders"),
  });
  const sig = detectForeignFunding(dossier.nihAwards, dossier.foreignEvidence);

  console.log(`# ${piName}`);
  console.log(
    `NIH awards: ${dossier.nihAwards.length} | OpenAlex works: ${dossier.works.length} | ` +
      `foreign-evidence items: ${dossier.foreignEvidence.length}`,
  );
  console.log(sig.fired ? `SIGNAL  score=${sig.score}` : "no signal", "-", sig.reason);
  for (const e of sig.evidence.filter((x) => x.concurrentWithAward)) {
    console.log(`  - [${e.country}] ${e.label} (${e.workYear ?? "?"}) ~ award ${e.concurrentWithAward}`);
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
