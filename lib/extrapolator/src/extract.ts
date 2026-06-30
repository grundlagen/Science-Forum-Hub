// Pure extractors: turn connector payloads into the typed inputs the detector needs.
import type { ReporterProject } from "@workspace/integration-nih-reporter";
import type { OpenAlexWork } from "@workspace/integration-openalex";

export interface NihAward {
  coreProjectNum: string;
  startYear: number | null;
  endYear: number | null;
}

export interface ForeignEvidence {
  type: "foreign_affiliation" | "foreign_funder";
  country: string;
  label: string;
  workYear: number | null;
  workRef: string;
}

export function parseYear(date?: string | null): number | null {
  if (!date) return null;
  const m = /(\d{4})/.exec(date);
  return m ? Number(m[1]) : null;
}

// "Foreign" for NIH-disclosure purposes = any country that is not the US.
export function isForeign(code?: string | null): boolean {
  return !!code && code.toUpperCase() !== "US";
}

export function reporterToAwards(projects: ReporterProject[]): NihAward[] {
  const awards: NihAward[] = [];
  for (const p of projects) {
    const core = p.core_project_num ?? p.project_num;
    if (!core) continue;
    awards.push({
      coreProjectNum: core,
      startYear: parseYear(p.project_start_date),
      endYear: parseYear(p.project_end_date),
    });
  }
  return awards;
}

// Extract foreign-support evidence from a set of OpenAlex works: foreign author
// affiliations, and (if a funder->country resolver is supplied) foreign funders.
export function worksToForeignEvidence(
  works: OpenAlexWork[],
  funderCountry?: (funderId: string) => string | null,
): ForeignEvidence[] {
  const ev: ForeignEvidence[] = [];
  for (const w of works) {
    const year = parseYear(w.publication_date);
    const ref = w.id ?? w.doi ?? "unknown-work";
    for (const a of w.authorships ?? []) {
      for (const inst of a.institutions ?? []) {
        const cc = inst.country_code;
        if (isForeign(cc)) {
          ev.push({
            type: "foreign_affiliation",
            country: (cc as string).toUpperCase(),
            label: inst.display_name ?? "unknown institution",
            workYear: year,
            workRef: ref,
          });
        }
      }
    }
    for (const g of w.grants ?? []) {
      const fid = g.funder ?? undefined;
      const cc = fid && funderCountry ? funderCountry(fid) : null;
      if (isForeign(cc)) {
        ev.push({
          type: "foreign_funder",
          country: (cc as string).toUpperCase(),
          label: g.funder_display_name ?? fid ?? "unknown funder",
          workYear: year,
          workRef: ref,
        });
      }
    }
  }
  return ev;
}
