// Mega scan: run the FULL Pipeline B + C beast across every foreign-funding validation
// case and emit one bundled attorney-ready report. For each case: resolve identity ->
// detect foreign funding -> build certification chain -> assemble case package. Cases
// that suppress on ambiguous identity are reported as such (working as designed).
//
//   pnpm --filter @workspace/extrapolator run mega-scan
//   pnpm --filter @workspace/extrapolator run mega-scan -- --out /tmp/mega.md
import { writeFileSync } from "node:fs";
import { buildDossier } from "./dossier";
import { detectForeignFunding } from "./detectors/foreignFunding";
import { buildCertificationChain, type GrantRef } from "./certification";
import { assembleCase, renderCasePackage } from "./casePackage";
import { FOREIGN_FUNDING_CASES, type ForeignFundingCase } from "./foreignFundingCases";

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

interface CaseOut {
  c: ForeignFundingCase;
  markdown: string;
  fired: boolean;
  score: number;
  confidence: number;
  countries: string[];
  countryHit: boolean | null;
  awards: number;
  error?: string;
}

async function runOne(c: ForeignFundingCase): Promise<CaseOut> {
  try {
    const d = await buildDossier(c.pi, { resolveFunderCountries: true, orgHint: c.org });
    const sig = detectForeignFunding(d.nihAwards, d.foreignEvidence, {
      matchConfidence: d.matchConfidence,
    });

    const concurrent = sig.evidence.filter((e) => e.concurrentWithAward);
    const countries = [...new Set(concurrent.map((e) => e.country))];
    const countryHit = sig.fired ? countries.includes(c.expectedCountry) : null;

    if (!sig.fired) {
      const md = [
        `## ${c.label}`,
        `- PI searched: **${c.pi}** @ ${c.org}  ·  expected country: ${c.expectedCountry}`,
        `- Resolved: ${d.openalexAuthorId ?? "none"} (${d.matchMethod}, conf ${d.matchConfidence.toFixed(2)})`,
        `- **No case package** — ${sig.reason}`,
        ``,
      ].join("\n");
      return { c, markdown: md, fired: false, score: sig.score, confidence: d.matchConfidence, countries, countryHit, awards: d.nihAwards.length };
    }

    const exemplar = concurrent.find((e) => e.grantLinked) ?? concurrent[0];
    const title = d.works.find((w) => (w.id ?? w.doi) === exemplar?.workRef)?.title ?? null;
    const grants: GrantRef[] = d.nihAwards.map((a) => ({
      coreProjectNum: a.coreProjectNum,
      piName: d.displayName ?? c.pi,
      institution: c.org,
      startYear: a.startYear,
      endYear: a.endYear,
    }));
    const chain = buildCertificationChain({
      work: {
        ref: exemplar?.workRef ?? d.openalexAuthorId ?? c.pi,
        title,
        correspondingAuthor: d.displayName ?? c.pi,
        seniorAuthorIsPi: true,
      },
      grants,
      signalKind: sig.kind,
      signalScore: sig.score,
    });
    const pkg = assembleCase({ signal: sig, chain, researcherName: d.displayName ?? c.pi });

    const header = [
      `## ${c.label}`,
      `- Cited country/entity: **${c.expectedCountry}** — ${c.foreignEntity}`,
      `- Resolved: ${d.openalexAuthorId} (ORCID ${d.orcid ?? "n/a"}, ${d.matchMethod}, conf ${d.matchConfidence.toFixed(2)}, ${d.matchedPmidCount}/${d.anchorPmidCount} grant-linked PMIDs)`,
      `- Surfaced foreign countries: ${countries.join(", ")}  ·  cited-country hit: ${countryHit ? "YES" : "no"}`,
      `- Settlement of record: ${c.notes}`,
      `- Source: ${c.referenceUrl}`,
      ``,
    ].join("\n");

    return {
      c,
      markdown: header + renderCasePackage(pkg),
      fired: true,
      score: sig.score,
      confidence: d.matchConfidence,
      countries,
      countryHit,
      awards: d.nihAwards.length,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      c,
      markdown: `## ${c.label}\n- **ERROR**: ${msg}\n`,
      fired: false,
      score: 0,
      confidence: 0,
      countries: [],
      countryHit: null,
      awards: 0,
      error: msg,
    };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const out = flagValue(args, "--out") ?? "/tmp/mega-scan.md";
  const includeNonNih = args.includes("--all");

  const cases = FOREIGN_FUNDING_CASES.filter((c) => includeNonNih || c.nihCase);
  console.error(`mega scan: ${cases.length} case(s) -> ${out}\n`);

  const outs: CaseOut[] = [];
  for (const c of cases) {
    console.error(`→ ${c.pi} @ ${c.org}`);
    outs.push(await runOne(c));
  }

  const fired = outs.filter((o) => o.fired);
  const graded = outs.filter((o) => o.countryHit != null);
  const hits = graded.filter((o) => o.countryHit).length;

  const doc = [
    `# Mega scan — undisclosed foreign-funding validation set`,
    ``,
    `> **Probable cause for review — not a finding of fraud. Not legal advice.**`,
    `> File under seal first; nothing publishable without FCA counsel sign-off.`,
    ``,
    `- Generated: ${new Date().toISOString()}`,
    `- Cases run: ${outs.length}  ·  fired: ${fired.length}  ·  suppressed/error: ${outs.length - fired.length}`,
    `- Cited-country match (of fired): ${hits}/${graded.length}`,
    ``,
    `## Summary table`,
    ``,
    `| Case | Resolved conf | Awards | Fired | Score | Countries | Cited | Hit |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- |`,
    ...outs.map(
      (o) =>
        `| ${o.c.pi} | ${o.confidence.toFixed(2)} | ${o.awards} | ${o.fired ? "yes" : "no"} | ${o.score} | ${o.countries.join(",") || "-"} | ${o.c.expectedCountry} | ${o.error ? "ERR" : o.countryHit == null ? "—" : o.countryHit ? "YES" : "no"} |`,
    ),
    ``,
    `---`,
    ``,
    ...outs.map((o) => o.markdown),
  ].join("\n");

  writeFileSync(out, doc);
  console.error(
    `\nwrote ${out} — ${fired.length}/${outs.length} fired, cited-country match ${hits}/${graded.length}`,
  );
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
