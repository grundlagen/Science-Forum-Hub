// Copied-test-data detector: quality-control test results that were copied between
// submissions instead of measured. Modeled directly on U.S. ex rel. v. Kokosing/Shelly
// (2025, ~$30M): relators noticed asphalt QC data points repeated verbatim across
// unrelated tests, sourced from multiple places to lower detection odds.
//
// Pure logic over already-extracted numeric test sequences. Two independent checks:
//   1. whole-sequence duplicates  — the same measurement vector filed twice;
//   2. shared runs               — a window of >= RUN_LEN consecutive identical values
//                                  appearing in two different submissions.
// Copying across *different projects* scores higher: no innocent reason for one
// project's measurements to reappear in another's.
import type { SignalKind, FraudDomain } from "@workspace/db/schema";
import type { DetectorSignal } from "./base";

const KIND: SignalKind = "copied_test_data";
const DOMAIN: FraudDomain = "general_federal_award";
const DETECTOR = "copied-test-data/v1";

/** One QC/test submission: an ordered numeric measurement sequence plus context. */
export interface TestSubmission {
  submissionId: string;
  contractor?: string;
  project?: string;
  values: number[];
}

const RUN_LEN = 5; // consecutive identical values needed to call a shared run
const DECIMALS = 4; // rounding used for fingerprinting (measurement noise floor)

function fp(values: number[]): string {
  return values.map((v) => v.toFixed(DECIMALS)).join("|");
}

export interface CopiedRun {
  a: string; // submissionId
  b: string;
  runLength: number;
  values: number[];
  crossProject: boolean;
}

export interface CopiedDataFinding {
  exactDuplicates: Array<{ submissionIds: string[]; crossProject: boolean }>;
  sharedRuns: CopiedRun[];
}

/** Longest common run of consecutive identical (rounded) values across two sequences. */
export function longestSharedRun(a: number[], b: number[]): { length: number; values: number[] } {
  const ra = a.map((v) => v.toFixed(DECIMALS));
  const rb = b.map((v) => v.toFixed(DECIMALS));
  // Index all b-windows of RUN_LEN, then extend the best a-match.
  const bStarts = new Map<string, number[]>();
  for (let j = 0; j + RUN_LEN <= rb.length; j++) {
    const key = rb.slice(j, j + RUN_LEN).join("|");
    (bStarts.get(key) ?? bStarts.set(key, []).get(key)!).push(j);
  }
  let best = { length: 0, values: [] as number[] };
  for (let i = 0; i + RUN_LEN <= ra.length; i++) {
    const key = ra.slice(i, i + RUN_LEN).join("|");
    for (const j of bStarts.get(key) ?? []) {
      let len = RUN_LEN;
      while (i + len < ra.length && j + len < rb.length && ra[i + len] === rb[j + len]) len++;
      if (len > best.length) best = { length: len, values: a.slice(i, i + len) };
    }
  }
  return best;
}

export function findCopiedTestData(submissions: TestSubmission[]): CopiedDataFinding {
  // 1. Whole-sequence duplicates.
  const byFp = new Map<string, TestSubmission[]>();
  for (const s of submissions) {
    if (s.values.length === 0) continue;
    const k = fp(s.values);
    (byFp.get(k) ?? byFp.set(k, []).get(k)!).push(s);
  }
  const exactDuplicates = [...byFp.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      submissionIds: g.map((s) => s.submissionId),
      crossProject: new Set(g.map((s) => s.project ?? "")).size > 1,
    }));

  // 2. Shared runs between non-identical submissions.
  const dupIds = new Set(exactDuplicates.flatMap((d) => d.submissionIds));
  const sharedRuns: CopiedRun[] = [];
  for (let i = 0; i < submissions.length; i++) {
    for (let j = i + 1; j < submissions.length; j++) {
      const a = submissions[i];
      const b = submissions[j];
      if (dupIds.has(a.submissionId) && dupIds.has(b.submissionId)) continue; // already exact
      const run = longestSharedRun(a.values, b.values);
      if (run.length >= RUN_LEN) {
        sharedRuns.push({
          a: a.submissionId,
          b: b.submissionId,
          runLength: run.length,
          values: run.values,
          crossProject: (a.project ?? "") !== (b.project ?? ""),
        });
      }
    }
  }
  return { exactDuplicates, sharedRuns };
}

export function detectCopiedTestData(
  subjectName: string,
  submissions: TestSubmission[],
): DetectorSignal {
  const finding = findCopiedTestData(submissions);
  const dupCount = finding.exactDuplicates.length;
  const runCount = finding.sharedRuns.length;
  const crossProject =
    finding.exactDuplicates.some((d) => d.crossProject) ||
    finding.sharedRuns.some((r) => r.crossProject);
  const fired = dupCount > 0 || runCount > 0;

  let score = 0;
  if (fired) {
    score = 30; // any verbatim reuse of measurement data is already abnormal
    score += Math.min(30, 10 * dupCount);
    score += Math.min(20, 5 * runCount);
    if (crossProject) score += 20; // no innocent path for cross-project measurement reuse
    score = Math.min(100, score);
  }

  return {
    kind: KIND,
    detector: DETECTOR,
    fired,
    score,
    domain: DOMAIN,
    subjectName,
    reason: fired
      ? `${dupCount} exact duplicate test submission(s) and ${runCount} shared value run(s)` +
        `${crossProject ? ", including reuse ACROSS projects" : ""} in QC data filed by ` +
        `"${subjectName}". Measured data should never repeat verbatim (Kokosing pattern). ` +
        `Confirm units/protocol don't legitimately fix these values before any action.`
      : `No copied test data found across ${submissions.length} submission(s).`,
    evidence: finding,
  };
}
