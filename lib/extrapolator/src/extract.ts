// Pure extractors: turn connector payloads into the typed inputs the detector needs.
import type { ReporterProject } from "@workspace/integration-nih-reporter";
import type { OpenAlexWork } from "@workspace/integration-openalex";
import { normPmid } from "./resolvePi";

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
  // The work carries a PMID that NIH links to one of the PI's grants: the affiliation
  // is on a paper NIH itself says the grant produced ("produced under" vs merely "concurrent").
  grantLinked: boolean;
  // The affiliation belongs to the resolved PI (not an arbitrary foreign co-author).
  // Only meaningful for foreign_affiliation; true by construction for foreign_funder.
  isPiAffiliation: boolean;
}

export interface ForeignEvidenceOpts {
  // When set, foreign affiliations are taken ONLY from this author's own authorship
  // entry, so a US PI's Chinese co-author no longer fires the signal.
  resolvedAuthorId?: string | null;
  // PMIDs NIH links to the PI's grants (authoritative grant<->paper linkage).
  anchorPmids?: Set<string>;
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
  // RePORTER returns one row per fiscal year, so a single core project appears many
  // times. Collapse to distinct core projects, widening to the full award window.
  const byCore = new Map<string, NihAward>();
  for (const p of projects) {
    const core = p.core_project_num ?? p.project_num;
    if (!core) continue;
    const start = parseYear(p.project_start_date);
    const end = parseYear(p.project_end_date);
    const prev = byCore.get(core);
    if (!prev) {
      byCore.set(core, { coreProjectNum: core, startYear: start, endYear: end });
    } else {
      if (start != null && (prev.startYear == null || start < prev.startYear)) prev.startYear = start;
      if (end != null && (prev.endYear == null || end > prev.endYear)) prev.endYear = end;
    }
  }
  return [...byCore.values()];
}

// Extract foreign-support evidence from a set of OpenAlex works: foreign author
// affiliations, and (if a funder->country resolver is supplied) foreign funders.
// When opts.resolvedAuthorId is set, only the resolved PI's own affiliations count.
export function worksToForeignEvidence(
  works: OpenAlexWork[],
  funderCountry?: (funderId: string) => string | null,
  opts: ForeignEvidenceOpts = {},
): ForeignEvidence[] {
  const resolvedId = opts.resolvedAuthorId ?? null;
  const anchor = opts.anchorPmids;
  const ev: ForeignEvidence[] = [];
  for (const w of works) {
    const year = parseYear(w.publication_date);
    const ref = w.id ?? w.doi ?? "unknown-work";
    const grantLinked = !!anchor && !!normPmid(w.ids?.pmid) && anchor.has(normPmid(w.ids?.pmid)!);
    for (const a of w.authorships ?? []) {
      // Only the PI's own affiliation matters for a disclosure signal.
      const isPi = resolvedId == null || a.author?.id === resolvedId;
      if (!isPi) continue;
      for (const inst of a.institutions ?? []) {
        const cc = inst.country_code;
        if (isForeign(cc)) {
          ev.push({
            type: "foreign_affiliation",
            country: (cc as string).toUpperCase(),
            label: inst.display_name ?? "unknown institution",
            workYear: year,
            workRef: ref,
            grantLinked,
            isPiAffiliation: resolvedId != null,
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
          grantLinked,
          isPiAffiliation: true,
        });
      }
    }
  }
  return ev;
}
