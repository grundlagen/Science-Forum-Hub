// M2.1 — case assembly + export.
//
// Combines a detector signal + its certification chain into (a) a persistable case
// record (ri_cases / ri_signals) and (b) a human-readable case package: the artifact
// handed to FCA counsel and the DOJ FOCUS data-miner program.
//
// Everything here is PROBABLE CAUSE for review, never a finding of fraud. Default
// disclosure_state is "internal" — nothing is publishable without counsel sign-off.
import type {
  SignalKind,
  DisclosureState,
  InsertRiCase,
  InsertRiSignal,
} from "@workspace/db/schema";
import {
  riSignalsTable,
  riCasesTable,
} from "@workspace/db/schema";
import type { Db } from "./resolve";
import type { CertificationChain } from "./certification";
import type { DetectorSignal } from "./detectors/base";

export interface CasePackage {
  title: string;
  researcherName: string | null;
  disclosureState: DisclosureState;
  confidence: number;
  signalKind: SignalKind;
  detector: string;
  signalScore: number;
  signalReason: string;
  chain: CertificationChain;
  generatedAt: string;
}

export interface AssembleCaseInput {
  signal: DetectorSignal;
  chain: CertificationChain;
  researcherName?: string | null;
  disclosureState?: DisclosureState;
  now?: Date;
}

export function assembleCase(input: AssembleCaseInput): CasePackage {
  const { signal, chain } = input;
  const researcherName = input.researcherName ?? null;
  const title = `${researcherName ?? chain.work.ref} — ${signal.kind}`;
  return {
    title,
    researcherName,
    disclosureState: input.disclosureState ?? "internal",
    confidence: chain.confidence,
    signalKind: signal.kind,
    detector: signal.detector,
    signalScore: signal.score,
    signalReason: signal.reason,
    chain,
    generatedAt: (input.now ?? new Date()).toISOString(),
  };
}

export function casePackageToInsert(pkg: CasePackage): InsertRiCase {
  return {
    title: pkg.title,
    disclosureState: pkg.disclosureState,
    confidence: pkg.confidence,
    summary: pkg.chain.narrative,
  };
}

export function signalToInsert(signal: DetectorSignal): InsertRiSignal {
  return {
    kind: signal.kind,
    score: signal.score,
    reason: signal.reason,
    evidence: signal.evidence,
    detector: signal.detector,
  };
}

/** Persist signal + case rows. Returns the new ids. Requires an injected db client. */
export async function persistCase(
  db: Db,
  pkg: CasePackage,
  signal: DetectorSignal,
): Promise<{ caseId: number; signalId: number }> {
  const [sig] = await db.insert(riSignalsTable).values(signalToInsert(signal)).returning();
  const [row] = await db.insert(riCasesTable).values(casePackageToInsert(pkg)).returning();
  return { caseId: row.id, signalId: sig.id };
}

/** Render the case package as Markdown — the attorney / FOCUS deliverable. */
export function renderCasePackage(pkg: CasePackage): string {
  const c = pkg.chain;
  const grants = c.grants
    .map((g) => {
      const bits = [g.coreProjectNum];
      if (g.piName) bits.push(`PI: ${g.piName}`);
      if (g.institution) bits.push(g.institution);
      if (g.startYear || g.endYear) bits.push(`${g.startYear ?? "?"}–${g.endYear ?? "?"}`);
      return `  - ${bits.join("  ·  ")}`;
    })
    .join("\n");

  return [
    `# Case package: ${pkg.title}`,
    ``,
    `> **Probable cause for review — not a finding of fraud. Not legal advice.**`,
    `> Disclosure state: \`${pkg.disclosureState}\` (nothing publishable without counsel sign-off).`,
    ``,
    `- Generated: ${pkg.generatedAt}`,
    `- Confidence: ${pkg.confidence}/100`,
    `- Researcher: ${pkg.researcherName ?? "(unresolved)"}`,
    ``,
    `## Signal`,
    `- Kind: \`${pkg.signalKind}\`  (detector: \`${pkg.detector}\`, score ${pkg.signalScore})`,
    `- ${pkg.signalReason}`,
    ``,
    `## Grant linkage`,
    c.linked ? grants : "  - (none established — no FCA theory)",
    ``,
    `## Certification chain`,
    `- Implied false certifications: ${c.impliedFalseCertifications.length ? c.impliedFalseCertifications.join(", ") : "(none)"}`,
    `- Oversight certification undermined: ${c.oversightUndermined ? "yes" : "no"}`,
    `- Counterfactual: ${c.counterfactual}`,
    ``,
    `## Narrative`,
    c.narrative,
    ``,
    `## Next steps`,
    `1. Human expert review + independent analysis (records the original-source basis).`,
    `2. Confirm grant linkage against NIH ExPORTER link tables.`,
    `3. Route to US FCA counsel; counsel decides disclosure sequencing and FOCUS engagement.`,
    ``,
  ].join("\n");
}
