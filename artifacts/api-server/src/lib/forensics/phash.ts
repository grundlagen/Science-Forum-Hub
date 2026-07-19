import type { GrayImage } from "./types";
import { resizeGray } from "./image";

const HASH_SIZE = 8; // 8x8 low-frequency block -> 64-bit hash
const DCT_SIZE = 32; // resize target before DCT

// Precomputed DCT-II basis for a 32-length signal.
const COS: number[][] = (() => {
  const c: number[][] = [];
  for (let u = 0; u < DCT_SIZE; u++) {
    c[u] = [];
    for (let x = 0; x < DCT_SIZE; x++) {
      c[u]![x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * DCT_SIZE));
    }
  }
  return c;
})();

function dct2d(input: Float64Array, size: number): Float64Array {
  // Separable DCT-II: rows then columns.
  const tmp = new Float64Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let u = 0; u < size; u++) {
      let s = 0;
      for (let x = 0; x < size; x++) s += input[y * size + x]! * COS[u]![x]!;
      tmp[y * size + u] = s;
    }
  }
  const out = new Float64Array(size * size);
  for (let u = 0; u < size; u++) {
    for (let v = 0; v < size; v++) {
      let s = 0;
      for (let y = 0; y < size; y++) s += tmp[y * size + v]! * COS[u]![y]!;
      out[u * size + v] = s;
    }
  }
  return out;
}

/**
 * DCT-based 64-bit perceptual hash, returned as a 16-char hex string.
 * Invariant to scale and mild brightness/contrast shifts.
 */
export function pHash(img: GrayImage): string {
  const small = resizeGray(img, DCT_SIZE, DCT_SIZE);
  const input = new Float64Array(DCT_SIZE * DCT_SIZE);
  for (let i = 0; i < input.length; i++) input[i] = small.data[i]!;
  const freq = dct2d(input, DCT_SIZE);

  // Top-left 8x8 low-frequency coefficients, excluding the DC term (0,0).
  const block: number[] = [];
  for (let u = 0; u < HASH_SIZE; u++) {
    for (let v = 0; v < HASH_SIZE; v++) {
      if (u === 0 && v === 0) continue;
      block.push(freq[u * DCT_SIZE + v]!);
    }
  }
  const sorted = [...block].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;

  // 63 comparison bits + a leading 0 to fill a clean 64-bit / 16-hex value.
  let bits = "0";
  for (const coeff of block) bits += coeff > median ? "1" : "0";

  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

const POPCOUNT: number[] = Array.from({ length: 16 }, (_, i) =>
  ((i >> 0) & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1),
);

/** Hamming distance (0..64) between two 16-char hex perceptual hashes. */
export function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    d += POPCOUNT[xor]!;
  }
  return d;
}

/** Map a Hamming distance to a 0..1 similarity. */
export function hammingSimilarity(distance: number): number {
  return 1 - distance / 64;
}
