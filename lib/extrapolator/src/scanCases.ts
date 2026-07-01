// Batch validation harness: run every foreign-funding ground-truth case through the
// live disambiguation + detector pipeline and grade the output against the facts the
// settlement actually cited (resolved identity, grant window, foreign country).
//
//   pnpm --filter @workspace/extrapolator run scan-cases
//   pnpm --filter @workspace/extrapolator run scan-cases -- --only "Qing Wang"
import { buildDossier } from "./dossier";
import { detectForeignFunding } from "./detectors/foreignFunding";
import { FOREIGN_FUNDING_CASES, type ForeignFundingCase } from "./foreignFundingCases";

interface CaseResult {
  c: ForeignFundingCase;
  authorId: string | null;
  orcid: string | null;
  confidence: number;
  method: string;
  awards: number;
  grantLinkedPmids: string;
  fired: boolean;
  score: number;
  countries: string[];
  countryHit: boolean | null;
  error?: string;
}

function topCountries(evidence: { country: string; concurrentWithAward: string | null }[]): string[] {
  const tally = new Map<string, number>();
  for (const e of evidence) {
    if (e.concurrentWithAward == null) continue;
    tally.set(e.country, (tally.get(e.country) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

async function runCase(c: ForeignFundingCase): Promise<CaseResult> {
  try {
    const d = await buildDossier(c.pi, { resolveFunderCountries: true, orgHint: c.org });
    const sig = detectForeignFunding(d.nihAwards, d.foreignEvidence, {
      matchConfidence: d.matchConfidence,
    });
    const countries = topCountries(sig.evidence);
    const countryHit = sig.fired ? countries.includes(c.expectedCountry) : null;
    return {
      c,
      authorId: d.openalexAuthorId,
      orcid: d.orcid,
      confidence: d.matchConfidence,
      method: d.matchMethod,
      awards: d.nihAwards.length,
      grantLinkedPmids: `${d.matchedPmidCount}/${d.anchorPmidCount}`,
      fired: sig.fired,
      score: sig.score,
      countries,
      countryHit,
    };
  } catch (e: unknown) {
    return {
      c,
      authorId: null,
      orcid: null,
      confidence: 0,
      method: "error",
      awards: 0,
      grantLinkedPmids: "0/0",
      fired: false,
      score: 0,
      countries: [],
      countryHit: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? args[onlyIdx + 1]?.toLowerCase() : null;

  const cases = FOREIGN_FUNDING_CASES.filter(
    (c) => c.nihCase && (!only || c.pi.toLowerCase().includes(only) || c.label.toLowerCase().includes(only)),
  );

  console.error(`scanning ${cases.length} NIH foreign-funding case(s)…\n`);
  const results: CaseResult[] = [];
  for (const c of cases) {
    console.error(`→ ${c.pi} @ ${c.org}`);
    results.push(await runCase(c));
  }

  console.log("");
  console.log(
    pad("PI", 18) +
      pad("conf", 6) +
      pad("method", 17) +
      pad("awd", 5) +
      pad("gPMID", 8) +
      pad("fired", 7) +
      pad("score", 7) +
      pad("countries", 14) +
      pad("exp", 5) +
      "hit",
  );
  console.log("-".repeat(96));
  for (const r of results) {
    const hit = r.error
      ? "ERR"
      : r.countryHit == null
        ? "—"
        : r.countryHit
          ? "YES"
          : "no";
    console.log(
      pad(r.c.pi, 18) +
        pad(r.confidence.toFixed(2), 6) +
        pad(r.method, 17) +
        pad(String(r.awards), 5) +
        pad(r.grantLinkedPmids, 8) +
        pad(r.fired ? "yes" : "no", 7) +
        pad(String(r.score), 7) +
        pad(r.countries.join(",") || "-", 14) +
        pad(r.c.expectedCountry, 5) +
        hit,
    );
    if (r.error) console.log(`    error: ${r.error}`);
  }

  const graded = results.filter((r) => !r.error && r.countryHit != null);
  const hits = graded.filter((r) => r.countryHit).length;
  console.log("-".repeat(96));
  console.log(
    `\nresolved+fired: ${graded.length}/${results.length}; ` +
      `country match: ${hits}/${graded.length}. ` +
      `(Cases that suppress on ambiguous identity are working as designed, not failures.)`,
  );
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
