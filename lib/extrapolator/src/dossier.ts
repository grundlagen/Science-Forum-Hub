// Assemble a per-PI dossier from public sources (NIH RePORTER + OpenAlex), then derive
// the inputs the foreign-funding detector consumes.
//
// M1 change: resolve the PI to a single OpenAlex author BEFORE extracting evidence.
// The anchor is NIH's own grant->publication link (RePORTER publications endpoint):
// the real PI is the candidate author who wrote the papers those grants produced.
// This replaces the old `authors[0]` guess that merged unrelated same-name people.
import {
  searchProjectsByPi,
  searchPublicationsByCoreProjects,
  type ReporterProject,
} from "@workspace/integration-nih-reporter";
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
import {
  normPmid,
  orgMatch,
  pickBestCandidate,
  type CandidateSignal,
  type MatchMethod,
} from "./resolvePi";

export interface Dossier {
  piName: string;
  openalexAuthorId: string | null;
  orcid: string | null;
  matchConfidence: number;
  matchMethod: MatchMethod;
  matchedPmidCount: number;
  anchorPmidCount: number;
  nihAwards: NihAward[];
  works: OpenAlexWork[];
  foreignEvidence: ForeignEvidence[];
}

export interface DossierOpts {
  maxWorks?: number;
  resolveFunderCountries?: boolean;
  // Cap on OpenAlex author candidates to disambiguate among (bounds network cost).
  maxCandidates?: number;
  // Optional disambiguator for common names: narrows NIH grants to this organisation
  // and lets a matching OpenAlex affiliation corroborate identity.
  orgHint?: string;
}

function worksPmids(works: OpenAlexWork[]): Set<string> {
  const s = new Set<string>();
  for (const w of works) {
    const p = normPmid(w.ids?.pmid);
    if (p) s.add(p);
  }
  return s;
}

function authorInstitutionNames(works: OpenAlexWork[], authorId: string | null): string[] {
  const names = new Set<string>();
  for (const w of works) {
    for (const a of w.authorships ?? []) {
      if (authorId != null && a.author?.id !== authorId) continue;
      for (const inst of a.institutions ?? []) if (inst.display_name) names.add(inst.display_name);
    }
  }
  return [...names];
}

// A distinct NIH-side identity: one contact-PI profile_id and its grants. Name search
// returns many same-name people; profile_id separates them so the resolved OpenAlex
// author is joined to ONE person's grants, not the whole name's pooled awards.
interface NihCluster {
  clusterId: string;
  projects: ReporterProject[];
  coreNums: string[];
  orgNames: string[];
}

function clusterProjectsByPi(projects: ReporterProject[]): {
  clusters: Map<string, NihCluster>;
  coreToCluster: Map<string, string>;
} {
  const clusters = new Map<string, NihCluster>();
  const coreToCluster = new Map<string, string>();
  for (const p of projects) {
    const pis = p.principal_investigators ?? [];
    const contact = pis.find((x) => x.is_contact_pi) ?? pis[0];
    const clusterId = contact?.profile_id != null ? String(contact.profile_id) : "unknown";
    const core = p.core_project_num ?? p.project_num ?? null;
    let c = clusters.get(clusterId);
    if (!c) {
      c = { clusterId, projects: [], coreNums: [], orgNames: [] };
      clusters.set(clusterId, c);
    }
    c.projects.push(p);
    if (core) {
      c.coreNums.push(core);
      coreToCluster.set(core, clusterId);
    }
    if (p.organization?.org_name) c.orgNames.push(p.organization.org_name);
  }
  return { clusters, coreToCluster };
}

export async function buildDossier(piName: string, opts: DossierOpts = {}): Promise<Dossier> {
  const maxWorks = opts.maxWorks ?? 100;
  const maxCandidates = opts.maxCandidates ?? 12;

  const projects = (
    await searchProjectsByPi(piName, {
      limit: 50,
      ...(opts.orgHint ? { orgNames: [opts.orgHint] } : {}),
    })
  ).results ?? [];
  const allOrgNames = [
    ...new Set(projects.map((p) => p.organization?.org_name).filter((n): n is string => !!n)),
  ];

  // Split the pooled name-matched grants into per-person clusters (by NIH profile_id).
  const { clusters, coreToCluster } = clusterProjectsByPi(projects);

  // Authoritative grant<->paper linkage, tagged back to the person-cluster that owns it.
  const allCoreNums = [...coreToCluster.keys()];
  const pmidToCluster = new Map<string, string>();
  const anchorPmids = new Set<string>();
  if (allCoreNums.length) {
    try {
      const pubs = (await searchPublicationsByCoreProjects(allCoreNums, { limit: 500 })).results ?? [];
      for (const pub of pubs) {
        const p = normPmid(pub.pmid);
        const core = pub.core_project_num ?? pub.coreproject ?? null;
        if (!p) continue;
        anchorPmids.add(p);
        const cl = core ? coreToCluster.get(core) : undefined;
        if (cl) pmidToCluster.set(p, cl);
      }
    } catch {
      // Linkage is best-effort; disambiguation falls back to institution/name.
    }
  }

  // Score each same-name OpenAlex author; when their works overlap NIH-linked PMIDs,
  // record WHICH person-cluster they belong to (majority of overlapping PMIDs).
  const authors = (await searchAuthors(piName, { perPage: maxCandidates })).results ?? [];
  const scored: { signal: CandidateSignal; works: OpenAlexWork[]; clusterId: string | null }[] = [];
  for (let i = 0; i < authors.length; i++) {
    const cand = authors[i];
    if (!cand.id) continue;
    const works = (await getWorksByAuthorId(cand.id, { perPage: maxWorks })).results ?? [];
    const pmids = worksPmids(works);
    let matched = 0;
    const clusterTally = new Map<string, number>();
    for (const p of pmids) {
      if (!anchorPmids.has(p)) continue;
      matched++;
      const cl = pmidToCluster.get(p);
      if (cl) clusterTally.set(cl, (clusterTally.get(cl) ?? 0) + 1);
    }
    const bestCluster =
      [...clusterTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    // Institution match only counts against a cluster we actually reached via grant
    // linkage, or an explicit org hint. Matching against the whole pooled name (dozens
    // of unrelated people's orgs) is meaningless and previously let a wrong-person
    // score sneak past the gate. No cluster + no hint => name-only => gated off.
    const orgScope = bestCluster
      ? clusters.get(bestCluster)?.orgNames ?? []
      : opts.orgHint
        ? [opts.orgHint]
        : [];
    const instNames = authorInstitutionNames(works, cand.id);
    scored.push({
      signal: {
        authorId: cand.id,
        orcid: cand.orcid ?? null,
        displayName: cand.display_name ?? null,
        matchedPmidCount: matched,
        instMatch: orgMatch(instNames, orgScope),
        rank: i,
      },
      works,
      clusterId: bestCluster,
    });
  }

  const resolution = pickBestCandidate(scored.map((s) => s.signal));
  const chosen = scored.find((s) => s.signal.authorId === resolution.authorId);
  const works = chosen?.works ?? [];

  // Filter awards to the resolved person-cluster (correct concurrency windows);
  // fall back to all pooled awards only when we could not resolve a cluster.
  const resolvedCluster = chosen?.clusterId ?? null;
  const clusterProjects = resolvedCluster ? clusters.get(resolvedCluster)?.projects ?? projects : projects;
  const nihAwards = reporterToAwards(clusterProjects);
  // Mark grant linkage using only the resolved cluster's PMIDs when known.
  const evidenceAnchor = resolvedCluster
    ? new Set([...pmidToCluster].filter(([, cl]) => cl === resolvedCluster).map(([p]) => p))
    : anchorPmids;

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

  const foreignEvidence = worksToForeignEvidence(works, funderCountry, {
    resolvedAuthorId: resolution.authorId,
    anchorPmids: evidenceAnchor,
  });

  return {
    piName,
    openalexAuthorId: resolution.authorId,
    orcid: resolution.orcid,
    matchConfidence: resolution.matchConfidence,
    matchMethod: resolution.method,
    matchedPmidCount: resolution.matchedPmidCount,
    anchorPmidCount: anchorPmids.size,
    nihAwards,
    works,
    foreignEvidence,
  };
}
