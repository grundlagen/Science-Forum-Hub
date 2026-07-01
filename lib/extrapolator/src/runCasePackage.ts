// Live end-to-end: PI -> NIH grants + OpenAlex works -> resolve identity ->
// foreign-funding signal -> certification chain -> rendered case package.
// This is the full Pipeline B + C beast against a real target.
//
//   pnpm --filter @workspace/extrapolator run case-package -- "Qing Wang" --org "Cleveland Clinic"
import { buildDossier } from "./dossier";
import { detectForeignFunding } from "./detectors/foreignFunding";
import { buildCertificationChain, type GrantRef } from "./certification";
import { assembleCase, renderCasePackage } from "./casePackage";

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
    console.error('usage: ... run case-package -- "First Last" [--org "Organization"]');
    process.exit(1);
  }

  const d = await buildDossier(piName, { resolveFunderCountries: true, orgHint: org });
  const sig = detectForeignFunding(d.nihAwards, d.foreignEvidence, {
    matchConfidence: d.matchConfidence,
  });

  console.error(
    `resolved ${d.openalexAuthorId ?? "none"} (${d.matchMethod}, conf ${d.matchConfidence.toFixed(2)}, ` +
      `${d.matchedPmidCount}/${d.anchorPmidCount} grant-linked PMIDs); awards=${d.nihAwards.length}`,
  );

  if (!sig.fired) {
    console.log(`# ${piName}: no case package`);
    console.log(sig.reason);
    process.exit(0);
  }

  // Exemplar work: prefer a grant-linked one, else the first foreign-concurrent one.
  const concurrent = sig.evidence.filter((e) => e.concurrentWithAward);
  const exemplar = concurrent.find((e) => e.grantLinked) ?? concurrent[0];
  const title = d.works.find((w) => (w.id ?? w.doi) === exemplar?.workRef)?.title ?? null;

  const grants: GrantRef[] = d.nihAwards.map((a) => ({
    coreProjectNum: a.coreProjectNum,
    piName: d.displayName ?? piName,
    institution: org ?? null,
    startYear: a.startYear,
    endYear: a.endYear,
  }));

  const chain = buildCertificationChain({
    work: {
      ref: exemplar?.workRef ?? d.openalexAuthorId ?? piName,
      title,
      correspondingAuthor: d.displayName ?? piName,
      seniorAuthorIsPi: true, // the resolved author IS the grant PI
    },
    grants,
    signalKind: sig.kind,
    signalScore: sig.score,
  });

  const pkg = assembleCase({
    signal: sig,
    chain,
    researcherName: d.displayName ?? piName,
  });

  console.log(renderCasePackage(pkg));
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
