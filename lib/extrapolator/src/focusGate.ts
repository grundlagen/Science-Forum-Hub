// FOCUS pre-filing gate — the data-miner tradecraft, encoded.
//
// DOJ's FOCUS initiative (Apr 2026) says it will prioritize data-miner qui tam actions
// that clear four bars. Data-mined cases have a LOWER success rate precisely because
// summary-data signals often can't plead falsity/materiality with particularity. This
// gate scores a candidate case against those four bars BEFORE anyone files or contacts
// a target, turning "we found an anomaly" into "we have a fileable matter — or here's
// exactly what's missing." It does not replace counsel; it makes the counsel meeting
// productive.
//
// The four requirements (paraphrased from DOJ/FOCUS commentary):
//   1. high-quality, reliable, PREDICTIVE signal (validated, not a one-off outlier);
//   2. Rule 9(b) particularity — named who/what/when/how, tied to specific claims;
//   3. legitimate innocent explanations anticipated and rebutted;
//   4. demonstrated grasp of the program's eligibility rules / regulatory framework.
import type { FraudDomain } from "@workspace/db/schema";

export interface CaseEvidenceProfile {
  domain: FraudDomain;
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
}

function req1(p: CaseEvidenceProfile): RequirementScore {
  const gaps: string[] = [];
  let s = 0;
  if (p.corroboratingDetectors >= 2) s += 15;
  else gaps.push("only one detector fired — a lone signal is not predictive; corroborate with an independent one");
  if (p.validatedAgainstGroundTruth) s += 10;
  else gaps.push("no measured precision/recall for this detector — run the validation harness to show the signal correlates to fraud");
  return { requirement: "1. High-quality, predictive signal", met: s >= 20, score: s, gaps };
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
  return { requirement: "2. Rule 9(b) particularity", met: s >= 20, score: s, gaps };
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
  const allMet = requirements.every((r) => r.met);
  const readiness: FocusAssessment["readiness"] = allMet
    ? "meeting_worth_counsel"
    : total >= 50
      ? "developing"
      : "not_ready";
  const openGaps = requirements.flatMap((r) => r.gaps).length;
  const summary =
    readiness === "meeting_worth_counsel"
      ? `All four FOCUS bars met (score ${total}/100). Worth a counsel meeting; counsel owns seal/first-to-file/original-source.`
      : `${openGaps} gap(s) before this is a fileable data-miner matter (score ${total}/100, readiness: ${readiness}). Close the gaps below — do not contact any target yet.`;
  return { domain: p.domain, requirements, total, readiness, summary };
}

export function renderFocusAssessment(a: FocusAssessment): string {
  const lines = [`# FOCUS pre-filing readiness — ${a.domain}`, ``, a.summary, ``];
  for (const r of a.requirements) {
    lines.push(`## ${r.requirement} — ${r.met ? "MET" : "gap"} (${r.score}/25)`);
    for (const g of r.gaps) lines.push(`- ${g}`);
    lines.push("");
  }
  lines.push("_Not legal advice. A readiness score is not a decision to file — counsel decides._");
  return lines.join("\n");
}
