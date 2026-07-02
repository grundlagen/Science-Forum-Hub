// CLI: run the foreign-funding detector for one PI.
//   pnpm --filter @workspace/extrapolator run detect-foreign-funding -- "Qing Wang" [--funders] [--org "Cleveland Clinic"]
import { buildDossier } from "./dossier";
import { detectForeignFunding } from "./detectors/foreignFunding";

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const org = flagValue(args, "--org");
  const piName = args
    .filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--org")
    .join(" ")
    .trim();
  if (!piName) {
    console.error('usage: ... run detect-foreign-funding -- "First Last" [--funders] [--org "Organization"]');
    process.exit(1);
  }
  const dossier = await buildDossier(piName, {
    resolveFunderCountries: args.includes("--funders"),
    orgHint: org,
  });
  const sig = detectForeignFunding(dossier.nihAwards, dossier.foreignEvidence, {
    confidence: dossier.matchConfidence,
    method: dossier.matchMethod,
    grantLinkedPmids: dossier.matchedPmidCount,
  });

  console.log(`# ${piName}`);
  console.log(
    `Resolved author: ${dossier.openalexAuthorId ?? "none"} ` +
      `(${dossier.matchMethod}, confidence ${dossier.matchConfidence.toFixed(2)}, ` +
      `${dossier.matchedPmidCount}/${dossier.anchorPmidCount} grant-linked PMIDs)` +
      (dossier.orcid ? ` ORCID ${dossier.orcid}` : ""),
  );
  console.log(
    `NIH awards: ${dossier.nihAwards.length} | OpenAlex works: ${dossier.works.length} | ` +
      `foreign-evidence items: ${dossier.foreignEvidence.length}`,
  );
  console.log(sig.fired ? `SIGNAL  score=${sig.score}` : "no signal", "-", sig.reason);
  // De-duplicate the printed evidence the same way the detector scores it.
  const seen = new Set<string>();
  for (const e of sig.evidence.filter((x) => x.concurrentWithAward)) {
    const k = `${e.type}|${e.country}|${e.label}|${e.concurrentWithAward}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const tag = e.grantLinked ? " [grant-linked]" : "";
    console.log(
      `  - [${e.country}] ${e.label} (${e.workYear ?? "?"}) ~ award ${e.concurrentWithAward}${tag}`,
    );
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
