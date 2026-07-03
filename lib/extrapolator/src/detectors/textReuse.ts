// Text-reuse / semantic-near-duplicate detector.
//
// Motivation (FCA research-grants angle): NIH/NSF/DoD grant progress reports and
// resulting publications frequently overlap in text — that alone is not fraud. But
// three patterns *are* signal:
//
//   1. Same passages recycled across *unrelated* awards (double-billing text ->
//      likely double-billing the underlying work).
//   2. Reported "novel result" text in a progress report near-duplicated by a
//      pre-existing publication the PI failed to cite (undisclosed prior art
//      passed off as newly funded work).
//   3. Retracted-paper text recycled verbatim into a *later*, still-funded paper
//      without disclosure (Retraction Watch cross-check).
//
// This module is pure logic over already-embedded passages. The embeddings come
// from S2AG's SPECTER2 bulk release (document-level) or an mxbai/BGE pass over
// paragraphs (finer granularity) — see scripts/ri-embed-download.sh (TODO).
//
// A near-duplicate hit is a lead for human review. Never a fraud finding.
import type { SignalKind, FraudDomain } from "@workspace/db/schema";
import type { DetectorSignal } from "./base";

const KIND: SignalKind = "data_anomaly";
const DOMAIN: FraudDomain = "research_grants";
const DETECTOR = "text-reuse/v1";

const NEAR_DUP_COSINE = 0.94; // conservative — SPECTER2 doc-level typical
const PASSAGE_COSINE = 0.88; // mxbai paragraph-level looser threshold

export interface EmbeddedPassage {
  /** Stable id: `${paperId}#${passageIx}` or just `${paperId}` for doc-level. */
  id: string;
  paperId: string;
  /** Optional linked award (NIH core-project number, NSF award id, ...). */
  awardId?: string;
  /** ISO date — used to enforce "later paper reuses earlier" direction. */
  publishedAt?: string;
  /** Set to true if paper is retracted (Retraction Watch join). */
  retracted?: boolean;
  vector: Float32Array | number[];
}

function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

export interface ReuseHit {
  a: EmbeddedPassage;
  b: EmbeddedPassage;
  cosine: number;
  crossAward: boolean;
  crossesRetraction: boolean;
}

/**
 * Brute-force cosine search — fine for the "one PI's corpus vs S2AG shard" scale
 * (thousands vs millions). For full-corpus scans wire FAISS/HNSW via the Python
 * side (services/image-forensics/embedding_index.py has the pattern).
 */
export function findReuse(
  probes: EmbeddedPassage[],
  haystack: EmbeddedPassage[],
  threshold = NEAR_DUP_COSINE,
): ReuseHit[] {
  const hits: ReuseHit[] = [];
  for (const p of probes) {
    for (const h of haystack) {
      if (p.id === h.id || p.paperId === h.paperId) continue;
      const c = cosine(p.vector, h.vector);
      if (c < threshold) continue;
      hits.push({
        a: p,
        b: h,
        cosine: c,
        crossAward: !!p.awardId && !!h.awardId && p.awardId !== h.awardId,
        crossesRetraction: !!p.retracted || !!h.retracted,
      });
    }
  }
  return hits.sort((x, y) => y.cosine - x.cosine);
}

/** Roll retrieval hits up into a single detector signal per subject. */
export function scoreReuseSignal(
  subjectName: string,
  hits: ReuseHit[],
): DetectorSignal {
  const crossAward = hits.filter((h) => h.crossAward);
  const retraction = hits.filter((h) => h.crossesRetraction);
  const fired = hits.length > 0;
  // Weight: cross-award reuse is the FCA-relevant class; retraction reuse is the
  // integrity-relevant class. Baseline near-dup alone is weak.
  const score =
    Math.min(1, hits.length / 5) * 0.3 +
    Math.min(1, crossAward.length / 3) * 0.5 +
    Math.min(1, retraction.length / 1) * 0.2;
  return {
    kind: KIND,
    detector: DETECTOR,
    fired,
    score,
    reason: fired
      ? `${hits.length} near-duplicate passages (${crossAward.length} cross-award, ${retraction.length} touching retracted work)`
      : "no near-duplicate passages above threshold",
    evidence: {
      threshold: NEAR_DUP_COSINE,
      passageThreshold: PASSAGE_COSINE,
      topHits: hits.slice(0, 20).map((h) => ({
        a: h.a.id,
        b: h.b.id,
        cosine: h.cosine,
        crossAward: h.crossAward,
        crossesRetraction: h.crossesRetraction,
      })),
    },
    domain: DOMAIN,
    subjectName,
  };
}
