"""
Within-corpus scientific-image duplication detector (proof of concept).

Two complementary, well-established techniques — neither is exotic:

  1. Perceptual hashing (pHash): catches whole-panel reuse / near-duplicates,
     robust to recompression and small edits. O(n) hashing + cheap Hamming compare.
  2. ORB feature matching + RANSAC homography: catches REGION reuse across panels
     even when the region is rotated, scaled, cropped or spliced — by finding a
     consistent geometric transform between many matched keypoints.

This is the "David model" detector: it compares a single lab's own figures against
each other. It needs NO giant external database. Scaling to cross-literature search
is the same primitives + an approximate-nearest-neighbour index (see cost notes).

Not legal advice. Output is a ranked signal for human review, not a fraud finding.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path

import cv2
import imagehash
import numpy as np
from PIL import Image


# ---- tunables -------------------------------------------------------------
PHASH_MAX_DISTANCE = 8          # Hamming distance <= this => likely near-duplicate
ORB_FEATURES = 2000
ORB_RATIO = 0.75                # Lowe ratio test
MIN_RANSAC_INLIERS = 12         # consistent geometric matches => reused region
MIN_RANSAC_INLIERS = 10         # lowered for small cloned regions (Iteration 3)
# ---------------------------------------------------------------------------


@dataclass
class Finding:
    a: str
    b: str
    method: str
    score: float
    detail: str

    def __str__(self) -> str:
        return (
            f"[{self.method:10s}] score={self.score:6.2f}  "
            f"{self.a}  <->  {self.b}   ({self.detail})"
        )


def load_images(folder: Path) -> dict[str, np.ndarray]:
    exts = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
    out: dict[str, np.ndarray] = {}
    for p in sorted(folder.iterdir()):
        if p.suffix.lower() in exts:
            img = cv2.imread(str(p), cv2.IMREAD_GRAYSCALE)
            if img is not None:
                out[p.name] = img
    return out


def phash_findings(folder: Path, names: list[str]) -> list[Finding]:
    hashes = {n: imagehash.phash(Image.open(folder / n)) for n in names}
    findings: list[Finding] = []
    for a, b in combinations(names, 2):
        dist = hashes[a] - hashes[b]
        if dist <= PHASH_MAX_DISTANCE:
            # map distance -> 0..100 confidence (0 distance = identical)
            score = max(0.0, 100.0 * (1 - dist / 64.0))
            findings.append(
                Finding(a, b, "phash", score, f"hamming={dist} (<= {PHASH_MAX_DISTANCE})")
            )
    return findings


def orb_findings(images: dict[str, np.ndarray], names: list[str]) -> list[Finding]:
    orb = cv2.ORB_create(nfeatures=ORB_FEATURES)
    feats = {}
    for n in names:
        kp, des = orb.detectAndCompute(images[n], None)
        feats[n] = (kp, des)

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    findings: list[Finding] = []
    for a, b in combinations(names, 2):
        kp_a, des_a = feats[a]
        kp_b, des_b = feats[b]
        if des_a is None or des_b is None or len(kp_a) < 8 or len(kp_b) < 8:
            continue
        raw = matcher.knnMatch(des_a, des_b, k=2)
        good = [m for m, n in (pair for pair in raw if len(pair) == 2) if m.distance < ORB_RATIO * n.distance]
        if len(good) < MIN_RANSAC_INLIERS:
            continue
        src = np.float32([kp_a[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        dst = np.float32([kp_b[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
        if mask is None:
            continue
        inliers = int(mask.sum())
        if inliers >= MIN_RANSAC_INLIERS:
            score = min(100.0, inliers)  # inlier count as a simple confidence proxy
            findings.append(
                Finding(a, b, "orb+ransac", score,
                        f"{inliers} geometrically-consistent matches (rotation/scale/crop invariant)")
            )
    return findings


def scan(folder: Path) -> list[Finding]:
    images = load_images(folder)
    names = list(images.keys())
    if len(names) < 2:
        print(f"Need >=2 images in {folder}", file=sys.stderr)
        return []
    findings = phash_findings(folder, names) + orb_findings(images, names)
    findings.sort(key=lambda f: f.score, reverse=True)
    return findings


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: python detector.py <folder-of-figure-panels>", file=sys.stderr)
        return 1
    folder = Path(sys.argv[1])
    findings = scan(folder)
    if not findings:
        print("No duplication signals above threshold.")
        return 0
    print(f"{len(findings)} duplication signal(s) for human review:\n")
    for f in findings:
        print(f"  {f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())