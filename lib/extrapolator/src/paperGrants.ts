// Paper -> grant linkage helpers built on NIH RePORTER's publications endpoint.
import {
  searchPublicationsByPmids,
  type ReporterProject,
} from "@workspace/integration-nih-reporter";
import type { GrantRef } from "./certification";
import { parseYear } from "./extract";

/** Fetch the NIH core project number(s) linked to a PMID (link_source = "reporter"). */
export async function grantRefsForPmid(pmid: string | number): Promise<GrantRef[]> {
  const res = await searchPublicationsByPmids([pmid]);
  const coreNums = new Set<string>();
  for (const r of res.results ?? []) {
    const core = r.coreproject ?? r.core_project_num;
    if (core) coreNums.add(core);
  }
  return [...coreNums].map((coreProjectNum) => ({ coreProjectNum }));
}

/** Enrich bare grant refs with PI / institution / period from already-fetched projects. */
export function enrichGrantRefs(refs: GrantRef[], projects: ReporterProject[]): GrantRef[] {
  const byCore = new Map<string, ReporterProject>();
  for (const p of projects) {
    const core = p.core_project_num ?? p.project_num;
    if (core) byCore.set(core, p);
  }
  return refs.map((ref) => {
    const p = byCore.get(ref.coreProjectNum);
    if (!p) return ref;
    return {
      ...ref,
      piName: p.principal_investigators?.[0]?.full_name ?? ref.piName ?? null,
      institution: p.organization?.org_name ?? ref.institution ?? null,
      startYear: parseYear(p.project_start_date),
      endYear: parseYear(p.project_end_date),
    };
  });
}
