// Peer-review checker framework for the Science Forum Hub — the "legitimacy engine".
//
// Design goal (per the plan): DON'T reinvent the wheel. Wrap the established
// open-source screening tools as pluggable checkers and run them into one integrated
// report, the way the QUEST/ASWG ScreenIT pipeline does for bioRxiv/medRxiv. Some
// checkers are NATIVE (we implement them because they're pure logic: statcheck,
// GRIM/fabrication, reference sanity); the rest are ADAPTERS to external engines that
// slot in when configured (SciScore, ODDPub, Barzooka, JetFighter, rtransparent,
// seek & blastn, RefChecker, ImageTwin/Proofig).
//
// Everything is a LEAD for human review, never a verdict — same rule as the relator side.

export type Severity = "info" | "minor" | "major";

export interface CheckFlag {
  severity: Severity;
  message: string;
}

export interface CheckResult {
  checker: string; // stable id, e.g. "statcheck"
  category: PeerReviewCategory;
  available: boolean; // false = external engine not configured; skipped, not failed
  ran: boolean;
  flags: CheckFlag[];
  detail?: unknown;
}

export type PeerReviewCategory =
  | "statistics" // numeric/reporting consistency
  | "fabrication" // impossible values
  | "image" // figure duplication/manipulation
  | "reporting" // rigor / reporting-guideline completeness
  | "transparency" // open data/code, limitations
  | "references" // citation existence/accuracy
  | "reagents" // nucleotide sequences, cell lines
  | "visualization"; // misleading figures (bar-of-continuous, rainbow maps)

// A manuscript reduced to the machine-checkable fields. Populate what you can; each
// checker uses only the fields it needs and reports available:false if it can't run.
export interface Manuscript {
  id: string;
  title?: string;
  fullText?: string; // plain text of the paper
  nhstResults?: import("./statcheck").NhstResult[]; // parsed statistics for statcheck
  reportedStats?: import("../stats/fabrication").ReportedStat[]; // means+N for GRIM
  references?: { raw: string; doi?: string; title?: string }[];
  figurePaths?: string[]; // local image files (feed the Python forensics service)
  sequences?: { label: string; sequence: string }[]; // nucleotide reagents
}

export interface PeerReviewChecker {
  id: string;
  category: PeerReviewCategory;
  /** Native checkers are always available; adapters return false unless configured. */
  available(): boolean;
  run(m: Manuscript): Promise<CheckResult> | CheckResult;
}

export interface PeerReviewReport {
  manuscriptId: string;
  results: CheckResult[];
  majorFlags: number;
  minorFlags: number;
  // A ScreenIT/SciScore-style headline: not a pass/fail, a triage recommendation.
  recommendation: "clean" | "minor_revisions" | "needs_human_review";
}

export async function runPeerReview(
  m: Manuscript,
  checkers: PeerReviewChecker[],
): Promise<PeerReviewReport> {
  const results: CheckResult[] = [];
  for (const c of checkers) {
    if (!c.available()) {
      results.push({ checker: c.id, category: c.category, available: false, ran: false, flags: [] });
      continue;
    }
    results.push(await c.run(m));
  }
  const flags = results.flatMap((r) => r.flags);
  const majorFlags = flags.filter((f) => f.severity === "major").length;
  const minorFlags = flags.filter((f) => f.severity === "minor").length;
  const recommendation: PeerReviewReport["recommendation"] =
    majorFlags > 0 ? "needs_human_review" : minorFlags > 0 ? "minor_revisions" : "clean";
  return { manuscriptId: m.id, results, majorFlags, minorFlags, recommendation };
}

export function renderPeerReviewReport(r: PeerReviewReport): string {
  const lines: string[] = [`# Peer-review screen: ${r.manuscriptId}`, ``, `Recommendation: **${r.recommendation}** (${r.majorFlags} major, ${r.minorFlags} minor)`, ``];
  for (const res of r.results) {
    const status = !res.available ? "skipped (not configured)" : res.flags.length === 0 ? "ok" : `${res.flags.length} flag(s)`;
    lines.push(`## ${res.checker} [${res.category}] — ${status}`);
    for (const f of res.flags) lines.push(`- **${f.severity}**: ${f.message}`);
    lines.push("");
  }
  lines.push("_Automated screen — leads for human review, not verdicts._");
  return lines.join("\n");
}
