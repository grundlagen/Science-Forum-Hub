import type {
  GrayImage,
  MatchResult,
  RecoveredTransform,
  MatchRegions,
  RegionBox,
} from "./types";
import { pHash, hammingHex, hammingSimilarity } from "./phash";
import { flipH, flipV, rotate90, rotate180, rotate270, at } from "./image";
import { isBlotLike } from "./blot";

/**
 * Similarity thresholds. Blot/gel matches are gated harder because low-texture
 * images collide easily. See docs/DUPLICATION_DETECTION_ONESHOT.md §2.
 */
export const THRESHOLDS = {
  nearDup: 0.9, // 1 - 6.4/64  (<= ~6 bits Hamming)
  nearDupBlot: 0.955, // <= ~3 bits Hamming
  copyMoveOffsetVotes: 8, // matching blocks agreeing on one offset
} as const;

export type NearDuplicateResult = {
  similarity: number;
  hamming: number;
  transform: RecoveredTransform | null;
};

const TRANSFORMS: { t: RecoveredTransform | null; fn: (i: GrayImage) => GrayImage }[] = [
  { t: null, fn: (i) => i },
  { t: { rotationDeg: 90 }, fn: rotate90 },
  { t: { rotationDeg: 180 }, fn: rotate180 },
  { t: { rotationDeg: 270 }, fn: rotate270 },
  { t: { flipH: true }, fn: flipH },
  { t: { flipV: true }, fn: flipV },
];

/**
 * Whole-figure near-duplicate via perceptual hash, testing rotation/flip
 * variants of B so transformed reuse (the strongest single misconduct signal)
 * is caught and the recovered transform reported.
 *
 * NOTE: this is the deterministic v1. Sub-region transformed reuse under
 * arbitrary affine warps needs keypoint matching (SIFT/ORB + RANSAC) — deferred,
 * see the one-shot §3D.
 */
export function nearDuplicate(a: GrayImage, b: GrayImage): NearDuplicateResult {
  const ha = pHash(a);
  let best: NearDuplicateResult = { similarity: -1, hamming: 64, transform: null };
  for (const { t, fn } of TRANSFORMS) {
    const hb = pHash(fn(b));
    const d = hammingHex(ha, hb);
    const sim = hammingSimilarity(d);
    if (sim > best.similarity) best = { similarity: sim, hamming: d, transform: t };
  }
  return best;
}

// ---- Copy-move (region cloned within one image) ----

type Block = { x: number; y: number; mean: number; sig: number[] };

function blockSignature(img: GrayImage, bx: number, by: number, size: number): Block {
  const sig: number[] = [];
  let mean = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = at(img, bx + x, by + y);
      mean += v;
    }
  }
  mean /= size * size;
  // Coarse 4x4 down-sample signature, mean-subtracted (contrast/brightness robust).
  const cell = size / 4;
  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) {
      let s = 0;
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          s += at(img, bx + cx * cell + x, by + cy * cell + y);
        }
      }
      sig.push(s / (cell * cell) - mean);
    }
  }
  return { x: bx, y: by, mean, sig };
}

function sigDistance(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    s += d * d;
  }
  return Math.sqrt(s);
}

export type CopyMoveResult = {
  detected: boolean;
  votes: number;
  regions: RegionBox[];
};

/**
 * Block-matching copy-move detection: find blocks with near-identical signatures
 * that are spatially separated, then require many of them to agree on one
 * translation offset (rules out ambient self-similarity).
 */
export function copyMove(img: GrayImage, blockSize = 16, step = 8): CopyMoveResult {
  const size = Math.max(8, blockSize - (blockSize % 4));
  const blocks: Block[] = [];
  for (let y = 0; y + size <= img.height; y += step) {
    for (let x = 0; x + size <= img.width; x += step) {
      const blk = blockSignature(img, x, y, size);
      // Skip near-flat blocks (uniform background) — they match everything.
      const energy = blk.sig.reduce((s, v) => s + Math.abs(v), 0);
      if (energy > size) blocks.push(blk);
    }
  }

  const SIG_TOL = size * 0.25;
  const MIN_SHIFT = size; // cloned region must be at least one block away
  const offsetVotes = new Map<string, RegionBox[]>();

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const bi = blocks[i]!;
      const bj = blocks[j]!;
      const dx = bj.x - bi.x;
      const dy = bj.y - bi.y;
      if (Math.abs(dx) < MIN_SHIFT && Math.abs(dy) < MIN_SHIFT) continue;
      if (sigDistance(bi.sig, bj.sig) > SIG_TOL) continue;
      const key = `${dx},${dy}`;
      const arr = offsetVotes.get(key) ?? [];
      arr.push({ x: bi.x, y: bi.y, w: size, h: size });
      arr.push({ x: bj.x, y: bj.y, w: size, h: size });
      offsetVotes.set(key, arr);
    }
  }

  let bestKey = "";
  let bestCount = 0;
  for (const [key, arr] of offsetVotes) {
    if (arr.length > bestCount) {
      bestCount = arr.length;
      bestKey = key;
    }
  }
  const votes = Math.floor(bestCount / 2);
  return {
    detected: votes >= THRESHOLDS.copyMoveOffsetVotes,
    votes,
    regions: bestKey ? offsetVotes.get(bestKey)!.slice(0, 12) : [],
  };
}

// ---- Splice seams (cut/merged lanes in blots & gels) ----

export type SpliceResult = { detected: boolean; score: number; seamsX: number[] };

/**
 * Column-discontinuity heuristic: a spliced blot/gel shows abrupt vertical seams
 * where the mean column intensity jumps far more than its neighbours. v1 — a full
 * implementation also checks duplicated background runs. See one-shot §3D.
 */
export function spliceSeams(img: GrayImage): SpliceResult {
  const { width: w, height: h } = img;
  if (w < 8) return { detected: false, score: 0, seamsX: [] };
  const colMean = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = 0; y < h; y++) s += img.data[y * w + x]!;
    colMean[x] = s / h;
  }
  const diffs = new Float64Array(w - 1);
  let mean = 0;
  for (let x = 0; x < w - 1; x++) {
    diffs[x] = Math.abs(colMean[x + 1]! - colMean[x]!);
    mean += diffs[x]!;
  }
  mean /= w - 1;
  let sd = 0;
  for (let x = 0; x < w - 1; x++) {
    const d = diffs[x]! - mean;
    sd += d * d;
  }
  sd = Math.sqrt(sd / (w - 1));
  const seamsX: number[] = [];
  const threshold = mean + 4 * sd;
  for (let x = 0; x < w - 1; x++) {
    if (sd > 0 && diffs[x]! > threshold) seamsX.push(x);
  }
  return { detected: seamsX.length > 0, score: sd > 0 ? seamsX.length : 0, seamsX };
}

// ---- Combiner ----

function fmtTransform(t: RecoveredTransform | null): string {
  if (!t) return "no transform";
  if (t.rotationDeg) return `a ${t.rotationDeg}° rotation`;
  if (t.flipH) return "a horizontal flip";
  if (t.flipV) return "a vertical flip";
  return "no transform";
}

/**
 * Cross-figure combiner. Returns a MatchResult only when the pair clears the
 * (blot-gated) threshold; observation text is strictly descriptive — no intent
 * language. Copy-move within a single image is handled by `copyMove` directly.
 */
export function scoreMatch(
  a: GrayImage,
  b: GrayImage,
  captionA: string | null,
  captionB: string | null,
): MatchResult | null {
  const blot = isBlotLike(a, captionA) || isBlotLike(b, captionB);
  const gate = blot ? THRESHOLDS.nearDupBlot : THRESHOLDS.nearDup;

  const nd = nearDuplicate(a, b);
  if (nd.similarity < gate) return null;

  const transformed = nd.transform !== null;
  const regions: MatchRegions | null = { a: [{ x: 0, y: 0, w: a.width, h: a.height }], b: [{ x: 0, y: 0, w: b.width, h: b.height }] };
  const observation = transformed
    ? `The two figures are near-identical under ${fmtTransform(nd.transform)} ` +
      `(perceptual-hash similarity ${nd.similarity.toFixed(3)}, ${nd.hamming} of 64 bits differ).`
    : `The two figures are near-identical with no transform ` +
      `(perceptual-hash similarity ${nd.similarity.toFixed(3)}, ${nd.hamming} of 64 bits differ).`;

  return {
    matchClass: transformed ? "transformed" : "near_dup",
    similarity: nd.similarity,
    transform: nd.transform,
    regions,
    blotLike: blot,
    observation,
  };
}
