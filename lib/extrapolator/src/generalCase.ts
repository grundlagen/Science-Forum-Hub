// General (non-research) case assembly + export: maps any DetectorSignal to the
// whistleblower program(s) that cover its domain and an indicative reward range.
// Probable cause for review; reward math is planning-only. Not legal advice.
import type { InsertRiCase, InsertRiSignal, DisclosureState } from "@workspace/db/schema";
import type { DetectorSignal } from "./detectors/base";
import {
  estimateReward,
  programsForDomain,
  type WhistleblowerProgram,
} from "./programs";

export interface GeneralCase {
  title: string;
  subjectName: string | null;
  domain: string | null;
  disclosureState: DisclosureState;
  confidence: number;
  signal: DetectorSignal;
  programs: WhistleblowerProgram[];
  estimatedRecoveryUsd: number | null;
}

export interface AssembleGeneralOpts {
  estimatedRecoveryUsd?: number;
  disclosureState?: DisclosureState;
  governmentDeclined?: boolean;
}

export function assembleGeneralCase(signal: DetectorSignal, opts: AssembleGeneralOpts = {}): GeneralCase {
  return {
    title: `${signal.subjectName ?? "subject"} — ${signal.kind}`,
    subjectName: signal.subjectName ?? null,
    domain: signal.domain ?? null,
    disclosureState: opts.disclosureState ?? "internal",
    confidence: signal.score,
    signal,
    programs: signal.domain ? programsForDomain(signal.domain) : [],
    estimatedRecoveryUsd: opts.estimatedRecoveryUsd ?? null,
  };
}

export function generalSignalToInsert(signal: DetectorSignal): InsertRiSignal {
  return {
    kind: signal.kind,
    domain: signal.domain ?? null,
    subjectName: signal.subjectName ?? null,
    score: signal.score,
    reason: signal.reason,
    evidence: signal.evidence,
    detector: signal.detector,
  };
}

export function generalCaseToInsert(gc: GeneralCase, opts: AssembleGeneralOpts = {}): InsertRiCase {
  const primary = gc.programs[0];
  const reward =
    primary && gc.estimatedRecoveryUsd != null
      ? estimateReward(primary, gc.estimatedRecoveryUsd, { governmentDeclined: opts.governmentDeclined })
      : null;
  return {
    title: gc.title,
    domain: (gc.domain as InsertRiCase["domain"]) ?? null,
    program: primary?.id ?? null,
    estimatedRewardUsd: reward ? reward.maxUsd : null,
    disclosureState: gc.disclosureState,
    confidence: gc.confidence,
    summary: gc.signal.reason,
  };
}

export function renderGeneralCase(gc: GeneralCase, opts: AssembleGeneralOpts = {}): string {
  const lines: string[] = [
    `# Case package: ${gc.title}`,
    ``,
    `> **Probable cause for review — not a finding of fraud. Not legal advice.**`,
    `> Disclosure state: \`${gc.disclosureState}\` (nothing publishable without counsel sign-off).`,
    ``,
    `- Domain: ${gc.domain ?? "(unset)"}`,
    `- Confidence: ${gc.confidence}/100`,
    `- Subject: ${gc.subjectName ?? "(unresolved)"}`,
    ``,
    `## Signal`,
    `- Kind: \`${gc.signal.kind}\`  (detector: \`${gc.signal.detector}\`, score ${gc.signal.score})`,
    `- ${gc.signal.reason}`,
    ``,
    `## Applicable whistleblower program(s)`,
  ];
  if (gc.programs.length === 0) {
    lines.push(`  - (no program mapped for this domain)`);
  } else {
    for (const p of gc.programs) {
      let line = `  - **${p.name}** (${p.agency}, ${p.statute}) — ${Math.round(p.rewardMinPct * 100)}–${Math.round(p.rewardMaxPct * 100)}%`;
      if (gc.estimatedRecoveryUsd != null) {
        const r = estimateReward(p, gc.estimatedRecoveryUsd, { governmentDeclined: opts.governmentDeclined });
        line += r.qualifies
          ? `  → est. reward $${r.minUsd.toLocaleString()}–$${r.maxUsd.toLocaleString()} on a $${gc.estimatedRecoveryUsd.toLocaleString()} recovery`
          : `  → ${r.note}`;
      }
      lines.push(line);
    }
  }
  lines.push(
    ``,
    `## Next steps`,
    `1. Human review: confirm identity (e.g., UEI), dates, and the underlying claim.`,
    `2. Establish the false-claim / non-compliance theory for the chosen program.`,
    `3. Route to qualified counsel; counsel decides filing + disclosure sequencing.`,
    ``,
  );
  return lines.join("\n");
}
