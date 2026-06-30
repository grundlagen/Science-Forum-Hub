"""
Advanced single-image forensics — the techniques ImageTwin/Proofig apply that the
basic pHash + cross-image ORB detector did not:

  1. intra-image copy-move: a region CLONED within the SAME panel (background fill,
     duplicated bands). ORB self-matching + translation-offset clustering.
  2. ELA (error-level analysis): recompression residual highlights spliced/edited
     regions that have a different compression history.

These complement detector.py (whole-panel pHash + cross-image ORB/RANSAC). The one
thing still out of reach offline is ImageTwin's ~150M-image CROSS-LITERATURE index;
that is a data/infra problem (DINOv2/CLIP embeddings + ANN), not an algorithm gap.

Not legal advice. Output is a ranked signal for human review.
"""
from __future__ import annotations

import io
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageChops


@dataclass
class ForensicResult:
    method: str
    score: float
    detail: str


# ---- intra-image copy-move -------------------------------------------------
def intra_image_copy_move(
    gray: np.ndarray,
    n_features: int = 4000,
    min_spatial_dist: float = 60.0,
    offset_bin: int = 8,
    min_cluster: int = 10,
    ratio: float = 0.8,
) -> ForensicResult:
    """Detect a region cloned elsewhere within the same image.

    Self-match ORB descriptors with a Lowe ratio test (distinctive matches only),
    keep pairs that are far apart spatially, and bucket their translation offsets.
    A heavily-populated offset bucket means many keypoints moved by the same vector —
    i.e. a pasted/cloned block. The ratio test + spatial gate suppress ordinary
    texture self-similarity (which otherwise causes clean-image false positives).
    """
    orb = cv2.ORB_create(nfeatures=n_features)
    kp, des = orb.detectAndCompute(gray, None)
    if des is None or len(kp) < min_cluster * 2:
        return ForensicResult("copy-move", 0.0, "too few keypoints")

    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    knn = matcher.knnMatch(des, des, k=3)

    offsets: dict[tuple[int, int], int] = {}
    for matches in knn:
        cand = [m for m in matches if m.queryIdx != m.trainIdx]
        if not cand:
            continue
        m1 = cand[0]
        # Lowe ratio test against the next-best non-self match: clones are distinctive,
        # generic texture is not.
        if len(cand) >= 2 and not (m1.distance < ratio * cand[1].distance):
            continue
        p = kp[m1.queryIdx].pt
        q = kp[m1.trainIdx].pt
        dx, dy = q[0] - p[0], q[1] - p[1]
        if (dx * dx + dy * dy) ** 0.5 < min_spatial_dist:
            continue  # ignore near-neighbours (texture, not a clone)
        key = (int(round(dx / offset_bin)), int(round(dy / offset_bin)))
        key = key if key >= (0, 0) else (-key[0], -key[1])  # canonicalise +/-
        offsets[key] = offsets.get(key, 0) + 1

    if not offsets:
        return ForensicResult("copy-move", 0.0, "no consistent offsets")
    best_key, best = max(offsets.items(), key=lambda kv: kv[1])
    if best < min_cluster:
        return ForensicResult("copy-move", 0.0, f"largest offset cluster={best} (<{min_cluster})")
    score = min(100.0, float(best) * 2.0)
    return ForensicResult("copy-move", score, f"{best} keypoints share a clone offset ~{tuple(c*offset_bin for c in best_key)}")


# ---- error-level analysis (splice hint) ------------------------------------
def ela_score(pil_img: Image.Image, quality: int = 90) -> ForensicResult:
    """Recompress at a known quality and measure the residual. Spliced-in regions
    with a different compression history light up. Supplementary signal (noisy alone)."""
    rgb = pil_img.convert("RGB")
    buf = io.BytesIO()
    rgb.save(buf, "JPEG", quality=quality)
    buf.seek(0)
    recompressed = Image.open(buf)
    diff = ImageChops.difference(rgb, recompressed)
    arr = np.asarray(diff).astype(np.float32)
    if arr.size == 0:
        return ForensicResult("ela", 0.0, "empty")
    # ratio of the brightest residual to mean: localized hotspots => possible splice
    mx = float(arr.max())
    mean = float(arr.mean()) + 1e-6
    ratio = mx / mean
    # map a high max/mean ratio into 0..100 (heuristic; for triage only)
    score = float(np.clip((ratio - 8.0) * 6.0, 0.0, 100.0))
    return ForensicResult("ela", score, f"max/mean residual ratio={ratio:.1f}")


def analyze_image(path: str) -> list[ForensicResult]:
    gray = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    pil = Image.open(path)
    out = []
    if gray is not None:
        out.append(intra_image_copy_move(gray))
    out.append(ela_score(pil))
    return out


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print("usage: python forensics.py <image>", file=sys.stderr)
        raise SystemExit(1)
    for r in analyze_image(sys.argv[1]):
        print(f"[{r.method:10s}] score={r.score:6.2f}  ({r.detail})")
