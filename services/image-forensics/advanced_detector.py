"""
Advanced cross-image detector: extends detector.py (pHash + ORB/RANSAC) with
FLIP-INVARIANT matching, so a region that was mirrored before being spliced is still
caught (plain homography assumes orientation is preserved, so it misses reflections).

Combine with forensics.intra_image_copy_move + forensics.ela_score for a fuller,
ImageTwin-style single-corpus pipeline. The remaining gap to ImageTwin is its
cross-literature image index (a data/infra build), not the algorithms here.
"""
from __future__ import annotations

from itertools import combinations
from pathlib import Path

import cv2
import numpy as np

import detector
from detector import Finding

# Flip matches are more permissive than oriented ones, so require a higher inlier count
# than the base RANSAC threshold to avoid clean-vs-clean coincidences.
FLIP_MIN_INLIERS = 22


def orb_ransac_inliers(a: np.ndarray, b: np.ndarray, n_features: int = 2000) -> int:
    orb = cv2.ORB_create(nfeatures=n_features)
    ka, da = orb.detectAndCompute(a, None)
    kb, db = orb.detectAndCompute(b, None)
    if da is None or db is None or len(ka) < 8 or len(kb) < 8:
        return 0
    matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
    raw = matcher.knnMatch(da, db, k=2)
    good = [m for m, n in (p for p in raw if len(p) == 2) if m.distance < 0.75 * n.distance]
    if len(good) < detector.MIN_RANSAC_INLIERS:
        return 0
    src = np.float32([ka[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([kb[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
    return 0 if mask is None else int(mask.sum())


def scan(folder: Path) -> list[Finding]:
    """detector.scan + flip-invariant ORB pass (catches mirrored splices)."""
    images = detector.load_images(folder)
    names = list(images.keys())
    findings = detector.scan(folder)
    seen = {frozenset({f.a, f.b}) for f in findings}

    for a, b in combinations(names, 2):
        if frozenset({a, b}) in seen:
            continue
        for axis, label in ((1, "h-flip"), (0, "v-flip")):
            inliers = orb_ransac_inliers(images[a], cv2.flip(images[b], axis))
            if inliers >= FLIP_MIN_INLIERS:
                findings.append(
                    Finding(a, b, "orb+flip", min(100.0, float(inliers)),
                            f"{inliers} matches after {label} (mirrored region reuse)")
                )
                break

    findings.sort(key=lambda f: f.score, reverse=True)
    return findings
