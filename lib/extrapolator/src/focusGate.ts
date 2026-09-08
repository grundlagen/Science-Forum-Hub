// Internal evidence-completeness screen inspired by DOJ FOCUS, not an official
// DOJ scoring system or a determination that a complaint is legally sufficient.
// A score cannot establish falsity, knowledge, materiality, or relator eligibility.
import type { FraudDomain } from "@workspace/db/schema";

export interface CaseEvidenceProfile {
  domain: FraudDomain;
  // Source locators plus a claim-specific explanation; existence is checked here,
  // evidentiary weight and legal sufficiency must be assessed by counsel.
  claimFalsityEvidence?: string[];
  knowledgeEvidence?: string[];
  materialityEvidence?: string[];
  programRuleAppliesToClaim?: boolean;
  knownResolvedMatter?: boolean;
  // 1. signal quality
  corroboratingDetectors: number; // independent detectors that agree
  validatedAgainstGroundTruth: boolean; // detector has a measured precision/recall
  // 2. particularity
  namedEntities: number; // specific defendants identified (not "someone")
  identifiedClaims: number; // specific claims/awards/submissions cited
  hasDates: boolean; // concrete dates/time window
  identityConfirmed: boolean; // subject identity anchored (not a common-name merge)
  // 3. innocent explanations
  legitimateExplanationsConsidered: string[]; // benign readings written down
  legitimateExplanationsRebutted: number; // how many were checked and ruled out
  // 4. program knowledge
  citedProgramRules: string[]; // e.g. "31 U.S.C. 3729", "2 CFR 200", "PPP IFR size rule"
}

export interface RequirementScore {
  requirement: string;
  met: boolean;
  score: number; // 0..25
  gaps: string[];
}

export interface FocusAssessment {
  domain: FraudDomain;
  requirements: RequirementScore[];
  total: number; // 0..100
  readiness: "not_ready" | "developing" | "meeting_worth_counsel";
  summary: string;
  evidenceGaps: string[];
}

function req1(p: CaseEvidenceProfile): RequirementScore {
  const gaps: string[] = [];
  let s = 0;
  if (p.corroboratingDetectors >= 2) s += 15;
  else gaps.push("only one detector fired — a lone signal is not predictive; corroborate with an independent one");
  if (p.validatedAgainstGroundTruth) s += 10;
  else gaps.push("no measured precision/recall for this detector — run the validation harness to show the signal correlates to fraud");
  return { requirement: "1. High-quality, predictive signal", met: gaps.length === 0, score: s, gaps };
}

function req2(p: CaseEvidenceProfile): RequirementScore {
  const gaps: string[] = [];
  let s = 0;
  if (p.namedEntities >= 1) s += 7;
  else gaps.push("no specific defendant named");
  if (p.identifiedClaims >= 1) s += 8;
  else gaps.push("no specific claim/award/submission identified — Rule 9(b) needs particular claims, not aggregates");
  if (p.hasDates) s += 5;
  else gaps.push("no concrete dates/time window");
  if (p.identityConfirmed) s += 5;
  else gaps.push("subject identity not confirmed (possible common-name conflation) — anchor identity before filing");
  return { requirement: "2. Claim particularity for counsel review", met: gaps.length === 0, score: s, gaps };
}

function req3(p: CaseEvidenceProfile): RequirementScore {
  const gaps: string[] = [];
  let s = 0;
  const considered = p.legitimateExplanationsConsidered.length;
  if (considered >= 1) s += 10;
  else gaps.push("no innocent explanations written down — list the benign readings a defendant will offer");
  if (considered > 0 && p.legitimateExplanationsRebutted >= considered) s += 15;
  else if (considered > 0)
    gaps.push(`${considered - p.legitimateExplanationsRebutted} innocent explanation(s) not yet ruled out`);
  return { requirement: "3. Innocent explanations rebutted", met: s >= 20, score: s, gaps };
}

function req4(p: CaseEvidenceProfile): RequirementScore {
  const gaps: string[] = [];
  let s = 0;
  if (p.citedProgramRules.length >= 1) s += 12;
  else gaps.push("no program rule cited — show which eligibility/regulatory requirement was violated");
  if (p.citedProgramRules.length >= 2) s += 13;
  else gaps.push("cite the specific statute/regulation AND the program requirement it maps to");
  return { requirement: "4. Program-rule mastery", met: s >= 20, score: s, gaps };
}

export function assessFocusReadiness(p: CaseEvidenceProfile): FocusAssessment {
  const requirements = [req1(p), req2(p), req3(p), req4(p)];
  const total = requirements.reduce((a, r) => a + r.score, 0);
  const evidenceGaps: string[] = [];
  const hasEvidence = (items?: string[]) => items?.some((item) => item.trim().length > 0) === true;
  if (!hasEvidence(p.claimFalsityEvidence)) evidenceGaps.push("No claim-specific evidence of falsity; an award or anomaly alone is insufficient.");
  if (!hasEvidence(p.knowledgeEvidence)) evidenceGaps.push("No evidence addressing knowledge, deliberate ignorance, or reckless disregard.");
  if (!hasEvidence(p.materialityEvidence)) evidenceGaps.push("No evidence explaining materiality to government payment or approval.");
  if (p.programRuleAppliesToClaim !== true) evidenceGaps.push("Program rule applicability to this entity, claim, and date remains unverified.");
  if (p.knownResolvedMatter) evidenceGaps.push("Known resolved matter: retain as a benchmark, not a new recovery lead.");
  const allMet = requirements.every((r) => r.met) && evidenceGaps.length === 0;
  const readiness: FocusAssessment["readiness"] = allMet
    ? "meeting_worth_counsel"
    : total >= 50
      ? "developing"
      : "not_ready";
  const openGaps = requirements.flatMap((r) => r.gaps).length + evidenceGaps.length;
  const summary =
    readiness === "meeting_worth_counsel"
      ? `Internal evidence-completeness checks met (score ${total}/100). Worth a counsel meeting; counsel owns seal/first-to-file/original-source.`
      : `${openGaps} gap(s) in the current investigation (score ${total}/100, readiness: ${readiness}). Close the gaps below — do not contact any target yet.`;
  return { domain: p.domain, requirements, total, readiness, summary, evidenceGaps };
}

export function renderFocusAssessment(a: FocusAssessment): string {
  const lines = [`# FOCUS pre-filing readiness — ${a.domain}`, ``, a.summary, ``];
  for (const r of a.requirements) {
    lines.push(`## ${r.requirement} — ${r.met ? "MET" : "gap"} (${r.score}/25)`);
    for (const g of r.gaps) lines.push(`- ${g}`);
    lines.push("");
  }
  for (const gap of a.evidenceGaps) lines.push(`- ${gap}`);
  lines.push("_Not legal advice. A readiness score is not a decision to file — counsel decides._");
  return lines.join("\n");
}
