/**
 * §4 fixture gate (the cheapest rung of the triage ladder).
 *
 * Every detector must catch all known-duplicate fixtures and clear all
 * known-distinct fixtures before it ships. Deterministic + dependency-free:
 * fixtures are synthesised GrayImages, so this runs with no DB, no network, no
 * image-decode step. Run: `pnpm --filter @workspace/api-server exec tsx scripts/forensics-fixture-test.ts`
 */
import type { GrayImage } from "../src/lib/forensics/index";
import {
  scoreMatch,
  copyMove,
  spliceSeams,
  suspicionScore,
  rotate180,
} from "../src/lib/forensics/index";

// --- deterministic fixture synthesis ---

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function noise(w: number, h: number, seed: number): GrayImage {
  const rnd = lcg(seed);
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rnd() * 256);
  return { width: w, height: h, data };
}

function clone(img: GrayImage): GrayImage {
  return { width: img.width, height: img.height, data: new Uint8Array(img.data) };
}

/** Copy a square patch from (sx,sy) to (dx,dy) within a copy of the image. */
function cloneRegion(img: GrayImage, sx: number, sy: number, size: number, dx: number, dy: number): GrayImage {
  const out = clone(img);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out.data[(dy + y) * img.width + (dx + x)] = img.data[(sy + y) * img.width + (sx + x)]!;
    }
  }
  return out;
}

/** Two-tone image with a hard vertical seam at the midpoint. */
function splicedImage(w: number, h: number): GrayImage {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data[y * w + x] = x < w / 2 ? 60 : 200;
  }
  return { width: w, height: h, data };
}

/** Smooth horizontal gradient — no seam. */
function gradientImage(w: number, h: number): GrayImage {
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data[y * w + x] = Math.min(255, x * 3);
  }
  return { width: w, height: h, data };
}

// --- harness ---

let failures = 0;
function check(name: string, pass: boolean, detail: string): void {
  const tag = pass ? "PASS" : "FAIL";
  if (!pass) failures++;
  console.log(`  [${tag}] ${name}${pass ? "" : ` — ${detail}`}`);
}

console.log("Near-duplicate / transformed reuse:");
{
  const a = noise(64, 64, 12345);

  const exact = scoreMatch(a, clone(a), null, null);
  check("exact duplicate detected as near_dup", exact !== null && exact.matchClass === "near_dup", `got ${JSON.stringify(exact)}`);

  const rotated = scoreMatch(a, rotate180(a), null, null);
  check(
    "180°-rotated reuse detected as transformed",
    rotated !== null && rotated.matchClass === "transformed" && rotated.transform?.rotationDeg === 180,
    `got ${JSON.stringify(rotated)}`,
  );

  const distinct = scoreMatch(noise(64, 64, 111), noise(64, 64, 999), null, null);
  check("two distinct figures NOT matched", distinct === null, `got ${JSON.stringify(distinct)}`);

  // Blot gate: a borderline match that clears the generic bar but not the blot bar.
  const blotA = noise(64, 64, 222);
  const blotB = clone(blotA);
  blotB.data[0] = blotB.data[0]! ^ 0xff; // perturb slightly
  const blotMatch = scoreMatch(blotA, blotB, "Western blot of GAPDH loading control", null);
  check("blot near-duplicate still detected above the stricter gate", blotMatch !== null, `got ${JSON.stringify(blotMatch)}`);
}

console.log("Copy-move (region cloned within one image):");
{
  const base = noise(128, 128, 7);
  const cloned = cloneRegion(base, 16, 16, 32, 80, 80);
  const posr = copyMove(cloned);
  check("cloned region detected", posr.detected, `votes=${posr.votes}`);

  const negr = copyMove(noise(128, 128, 8));
  check("clean image NOT flagged for copy-move", !negr.detected, `votes=${negr.votes}`);
}

console.log("Splice seams (cut/merged lanes):");
{
  const pos = spliceSeams(splicedImage(64, 40));
  check("hard vertical seam detected", pos.detected, `seams=${pos.seamsX.join(",")}`);

  const neg = spliceSeams(gradientImage(64, 40));
  check("smooth gradient NOT flagged as splice", !neg.detected, `seams=${neg.seamsX.join(",")}`);
}

console.log("Suspicion ranking:");
{
  const strong = suspicionScore([
    { matchClass: "transformed", similarity: 0.98, blotLike: false, corroborated: true },
    { matchClass: "near_dup", similarity: 0.95, blotLike: false, corroborated: true },
    { matchClass: "copy_move", similarity: 0.9, blotLike: false, corroborated: true },
  ]);
  const weak = suspicionScore([{ matchClass: "near_dup", similarity: 0.91, blotLike: true }]);
  const empty = suspicionScore([]);
  check("empty candidate scores 0", empty.score === 0, `got ${empty.score}`);
  check("strong cluster outranks a weak uncorroborated blot hit", strong.score > weak.score, `strong=${strong.score} weak=${weak.score}`);
  check("strong cluster topClass is transformed", strong.topClass === "transformed", `got ${strong.topClass}`);
}

console.log("");
if (failures > 0) {
  console.error(`FIXTURE GATE FAILED: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("FIXTURE GATE PASSED — all detectors caught positives and cleared negatives.");
