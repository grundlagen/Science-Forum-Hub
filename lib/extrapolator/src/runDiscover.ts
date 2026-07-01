// Real-world discovery scan — "most likely hunches first".
//
// Unlike scan-cases (which re-runs KNOWN settlements), this hunts for NEW candidates.
// Seed: OpenAlex works funded by NIH that ALSO carry a Chinese author affiliation.
// The strongest hunch is an author who appears with BOTH a US and a Chinese institution
// on the same NIH-funded paper — a concurrent foreign tie NIH disclosure rules cover.
// For each candidate we hand the name + their US institution to the SAME validated
// pipeline (buildDossier resolves via NIH grant->PMID linkage and gates on identity),
// so a wrong or ambiguous person self-suppresses. Fired candidates are ranked by
// grant-linked evidence then score, most-likely first.
//
// Output is PROBABLE CAUSE for human review, never a finding of fraud.
//
//   pnpm --filter @workspace/extrapolator run discover
//   pnpm --filter @workspace/extrapolator run discover -- --country CN --sample 40 --from 2018 --to 2021
import { searchWorks, type OpenAlexWork } from "@workspace/integration-openalex";
import { buildDossier } from "./dossier";
import { detectForeignFunding } from "./detectors/foreignFunding";

const NIH_FUNDER = "F4320332161"; // OpenAlex funder id, National Institutes of Health

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

interface Candidate {
  name: string;
  usInstitution: string;
  foreignInstitution: string;
  papers: number;
}

// From NIH-funded works, find authors carrying both a US and a foreign (target-country)
// institution on the SAME authorship entry. Returns distinct candidates, busiest first.
function extractDualAffiliationAuthors(works: OpenAlexWork[], country: string): Candidate[] {
  const byAuthor = new Map<string, Candidate>();
  for (const w of works) {
    for (const a of w.authorships ?? []) {
      const insts = a.institutions ?? [];
      const us = insts.find((i) => i.country_code === "US");
      const foreign = insts.find((i) => i.country_code === country);
      const name = a.author?.display_name;
      if (!us || !foreign || !name) continue;
      const prev = byAuthor.get(name);
      if (prev) prev.papers++;
      else
        byAuthor.set(name, {
          name,
          usInstitution: us.display_name ?? "unknown",
          foreignInstitution: foreign.display_name ?? "unknown",
          papers: 1,
        });
    }
  }
  return [...byAuthor.values()].sort((a, b) => b.papers - a.papers);
}

interface Hunch {
  cand: Candidate;
  authorId: string | null;
  confidence: number;
  method: string;
  awards: number;
  grantLinked: string;
  fired: boolean;
  score: number;
  countries: string[];
  linkedFacts: number;
}

async function runCandidate(c: Candidate, country: string): Promise<Hunch> {
  const d = await buildDossier(c.name, { resolveFunderCountries: true, orgHint: c.usInstitution });
  const sig = detectForeignFunding(d.nihAwards, d.foreignEvidence, {
    matchConfidence: d.matchConfidence,
  });
  const concurrent = sig.evidence.filter((e) => e.concurrentWithAward);
  const countries = [...new Set(concurrent.map((e) => e.country))];
  const linkedFacts = concurrent.filter((e) => e.grantLinked && e.country === country).length;
  return {
    cand: c,
    authorId: d.openalexAuthorId,
    confidence: d.matchConfidence,
    method: d.matchMethod,
    awards: d.nihAwards.length,
    grantLinked: `${d.matchedPmidCount}/${d.anchorPmidCount}`,
    fired: sig.fired,
    score: sig.score,
    countries,
    linkedFacts,
  };
}

function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const country = (flag(args, "--country") ?? "CN").toUpperCase();
  const sample = Number(flag(args, "--sample") ?? 25);
  const fromYear = flag(args, "--from") ?? "2018";
  const toYear = flag(args, "--to") ?? "2021";
  const maxRun = Number(flag(args, "--max") ?? 20);

  const filter = [
    `funders.id:${NIH_FUNDER}`,
    `institutions.country_code:${country}`,
    `from_publication_date:${fromYear}-01-01`,
    `to_publication_date:${toYear}-12-31`,
  ].join(",");

  console.error(`seed: NIH-funded works with a ${country} affiliation (${fromYear}-${toYear})`);
  const res = await searchWorks(filter, { perPage: sample, sort: "cited_by_count:desc" });
  console.error(`  ${res.meta?.count ?? "?"} works match; sampling top ${sample} by citations`);

  const candidates = extractDualAffiliationAuthors(res.results ?? [], country).slice(0, maxRun);
  console.error(`  ${candidates.length} dual US+${country} candidate author(s) to resolve\n`);

  const hunches: Hunch[] = [];
  for (const c of candidates) {
    console.error(`→ ${c.name}  (US: ${c.usInstitution} · ${country}: ${c.foreignInstitution})`);
    try {
      hunches.push(await runCandidate(c, country));
    } catch (e: unknown) {
      console.error(`   skip: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Most likely hunches first: fired, then grant-linked target-country facts, then score.
  hunches.sort(
    (a, b) =>
      Number(b.fired) - Number(a.fired) ||
      b.linkedFacts - a.linkedFacts ||
      b.score - a.score ||
      b.confidence - a.confidence,
  );

  console.log("");
  console.log(
    pad("candidate", 20) +
      pad("US org", 22) +
      pad("conf", 6) +
      pad("awd", 5) +
      pad("gPMID", 8) +
      pad("fired", 6) +
      pad("score", 7) +
      pad(`${country}-linked`, 10) +
      "countries",
  );
  console.log("-".repeat(104));
  for (const h of hunches) {
    console.log(
      pad(h.cand.name, 20) +
        pad(h.cand.usInstitution, 22) +
        pad(h.confidence.toFixed(2), 6) +
        pad(String(h.awards), 5) +
        pad(h.grantLinked, 8) +
        pad(h.fired ? "yes" : "no", 6) +
        pad(String(h.score), 7) +
        pad(String(h.linkedFacts), 10) +
        (h.countries.join(",") || "-"),
    );
  }
  console.log("-".repeat(104));
  const fired = hunches.filter((h) => h.fired);
  console.log(
    `\n${fired.length}/${hunches.length} fired. Top hunches carry grant-linked ${country} facts ` +
      `concurrent with an NIH award — PROBABLE CAUSE for human review only, not proof. File under seal first.`,
  );
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
