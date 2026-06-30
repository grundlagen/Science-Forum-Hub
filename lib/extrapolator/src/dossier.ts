// Assemble a per-PI dossier from public sources (NIH RePORTER + OpenAlex), then derive
// the inputs the foreign-funding detector consumes.
import { searchProjectsByPi } from "@workspace/integration-nih-reporter";
import {
  searchAuthors,
  getWorksByAuthorId,
  getFunder,
  type OpenAlexWork,
} from "@workspace/integration-openalex";
import {
  reporterToAwards,
  worksToForeignEvidence,
  type ForeignEvidence,
  type NihAward,
} from "./extract";

export interface Dossier {
  piName: string;
  openalexAuthorId: string | null;
  nihAwards: NihAward[];
  works: OpenAlexWork[];
  foreignEvidence: ForeignEvidence[];
}

export interface DossierOpts {
  maxWorks?: number;
  resolveFunderCountries?: boolean;
}

export async function buildDossier(piName: string, opts: DossierOpts = {}): Promise<Dossier> {
  const projects = (await searchProjectsByPi(piName, { limit: 50 })).results ?? [];
  const nihAwards = reporterToAwards(projects);

  const authors = (await searchAuthors(piName, { perPage: 5 })).results ?? [];
  const openalexAuthorId = authors[0]?.id ?? null;

  let works: OpenAlexWork[] = [];
  if (openalexAuthorId) {
    works = (await getWorksByAuthorId(openalexAuthorId, { perPage: opts.maxWorks ?? 50 })).results ?? [];
  }

  // Optional: resolve funder countries so foreign-FUNDER evidence (not just foreign
  // affiliations) can fire. Best-effort and cached.
  let funderCountry: ((id: string) => string | null) | undefined;
  if (opts.resolveFunderCountries) {
    const ids = new Set<string>();
    for (const w of works) for (const g of w.grants ?? []) if (g.funder) ids.add(g.funder);
    const cache = new Map<string, string | null>();
    for (const id of ids) {
      try {
        const f = await getFunder(id);
        cache.set(id, f.country_code ?? null);
      } catch {
        cache.set(id, null);
      }
    }
    funderCountry = (id: string) => cache.get(id) ?? null;
  }

  const foreignEvidence = worksToForeignEvidence(works, funderCountry);
  return { piName, openalexAuthorId, nihAwards, works, foreignEvidence };
}
