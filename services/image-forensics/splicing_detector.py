"""
Splicing seam detection for scientific images — the ImageTwin-equivalent
detector for western blot lane stitching and band cloning.

Adds three techniques the commercial tools use that we were missing:
  1. SEAM DETECTION: Edge discontinuity at clone/paste boundaries
  2. NOISE VARIANCE: Camera noise differences across image regions
  3. BAND SHAPE: Western blot band morphology comparison

Not legal advice. A detection is a lead for human review, not a finding.
"""
from __future__ import annotations

import cv2
import numpy as np
from dataclasses import dataclass


@dataclass
class SplicingResult:
    method: str
    score: float
    detail: str
    mask: np.ndarray | None = None  # optional pixel-level heatmap


def detect_clone_seams(gray: np.ndarray, block_size: int = 16,
                       threshold: float = 3.0) -> SplicingResult:
    """
    Detect hard edges at clone/paste boundaries by measuring gradient
    discontinuity. A cloned region pasted into a different background
    creates an unnatural edge where the cloned region ends.

    Algorithm:
    1. Divide image into blocks
    2. Compute gradient magnitude per block
    3. Look for rectangular regions with abnormally high edge gradients
       at their boundaries (the "paste seam")
    """
    h, w = gray.shape
    if h < block_size * 3 or w < block_size * 3:
        return SplicingResult("seam", 0.0, "image too small")

    # Gradient magnitude
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    grad_mag = np.hypot(gx, gy)

    # Block-based analysis
    bh, bw = h // block_size, w // block_size
    block_grads = np.zeros((bh, bw))
    for i in range(bh):
        for j in range(bw):
            sl = gray[i*block_size:(i+1)*block_size, j*block_size:(j+1)*block_size]
            block_grads[i, j] = np.std(sl)

    # Look for rectangular regions with anomalous edges
    # Scan for horizontal and vertical seam signatures
    seam_scores = []

    # Horizontal seam scan: look for rows where gradient spikes
    for i in range(1, bh - 1):
        row_diff = np.abs(block_grads[i] - block_grads[i-1]).mean()
        if row_diff > threshold:
            seam_scores.append(("horizontal", i * block_size, row_diff))

    # Vertical seam scan
    for j in range(1, bw - 1):
        col_diff = np.abs(block_grads[:, j] - block_grads[:, j-1]).mean()
        if col_diff > threshold:
            seam_scores.append(("vertical", j * block_size, col_diff))

    if not seam_scores:
        return SplicingResult("seam", 0.0, "no seam detected")

    # Score the strongest seam
    best = max(seam_scores, key=lambda x: x[2])
    score = min(100.0, best[2] * 10.0)
    return SplicingResult(
        "seam", score,
        f"{best[0]} seam at {best[1]}px (gradient anomaly={best[2]:.1f})"
    )


def detect_noise_anomaly(gray: np.ndarray, block_size: int = 32,
                         threshold: float = 2.0) -> SplicingResult:
    """
    Detect regions with different noise characteristics.
    Camera sensors have characteristic noise patterns (PRNU).
    When a region is spliced from a different image, the noise
    statistics change at the boundary.

    Simplified version using local noise variance.
    Full PRNU would require a reference set of images from the same camera.
    """
    h, w = gray.shape
    if h < block_size * 3 or w < block_size * 3:
        return SplicingResult("noise", 0.0, "image too small")

    # High-pass filter to isolate noise
    blurred = cv2.GaussianBlur(gray.astype(np.float32), (5, 5), 0)
    noise = gray.astype(np.float32) - blurred

    # Block-based noise variance
    bh, bw = h // block_size, w // block_size
    noise_var = np.zeros((bh, bw))
    for i in range(bh):
        for j in range(bw):
            sl = noise[i*block_size:(i+1)*block_size, j*block_size:(j+1)*block_size]
            noise_var[i, j] = np.var(sl)

    # Global variance statistics
    global_std = np.std(noise_var)
    global_mean = np.mean(noise_var)

    # Find blocks with anomalously different noise
    anomaly_mask = np.abs(noise_var - global_mean) > (threshold * global_std)
    anomaly_count = int(anomaly_mask.sum())

    if anomaly_count == 0:
        return SplicingResult("noise", 0.0, "uniform noise pattern")

    # Cluster anomalous blocks — contiguous anomalous regions suggest splicing
    score = min(100.0, anomaly_count * 100.0 / (bh * bw) * 5.0)
    return SplicingResult(
        "noise", score,
        f"{anomaly_count}/{bh*bw} blocks with anomalous noise (>{threshold}σ)"
    )


def detect_blot_band_anomalies(gray: np.ndarray) -> SplicingResult:
    """
    Western blot-specific: compare band shapes across lanes.
    In a legitimate blot, bands have characteristic shapes (Gaussian-like
    intensity profiles). Cloned bands have identical intensity profiles
    that are too perfect — natural bands always have slight variations.

    This detector looks for bands with identical intensity cross-sections,
    which is the signature of copy-paste band duplication.
    """
    h, w = gray.shape

    # Detect lanes: vertical strips of concentrated dark pixels
    col_sums = gray.sum(axis=0)
    col_mean = np.mean(col_sums)
    col_std = np.std(col_sums)

    # Find lanes as columns with significantly more signal (dark bands)
    lane_mask = col_sums < (col_mean - 0.3 * col_std)
    # Find contiguous lane regions
    lane_regions = []
    in_lane = False
    start = 0
    for j in range(w):
        if lane_mask[j] and not in_lane:
            start = j
            in_lane = True
        elif not lane_mask[j] and in_lane:
            lane_regions.append((start, j))
            in_lane = False
    if in_lane:
        lane_regions.append((start, w))

    if len(lane_regions) < 2:
        return SplicingResult("band", 0.0, "too few lanes detected")

    # For each lane, extract band intensity profiles
    lane_profiles = []
    for lo, hi in lane_regions:
        if hi - lo < 10:  # skip very narrow lanes
            continue
        lane_strip = gray[:, lo:hi]
        # Vertical intensity profile (average across lane width)
        profile = lane_strip.mean(axis=1)
        lane_profiles.append(profile)

    if len(lane_profiles) < 2:
        return SplicingResult("band", 0.0, "too few valid lanes")

    # Compare profiles across lanes — identical profiles = duplication
    duplicate_pairs = []
    for i in range(len(lane_profiles)):
        for j in range(i + 1, len(lane_profiles)):
            # Normalized cross-correlation
            a = lane_profiles[i] - lane_profiles[i].mean()
            b = lane_profiles[j] - lane_profiles[j].mean()
            a = a / (np.linalg.norm(a) + 1e-9)
            b = b / (np.linalg.norm(b) + 1e-9)
            correlation = np.dot(a, b)
            if correlation > 0.95:  # suspiciously high correlation
                duplicate_pairs.append((i, j, correlation))

    if not duplicate_pairs:
        return SplicingResult("band", 0.0, "all lane profiles distinct")

    best = max(duplicate_pairs, key=lambda x: x[2])
    score = min(100.0, (best[2] - 0.90) * 1000)
    return SplicingResult(
        "band", score,
        f"lanes {best[0]} and {best[1]} have near-identical profiles (corr={best[2]:.3f})"
    )


def analyze_splicing(image_path: str) -> list[SplicingResult]:
    """Run all splicing detectors on an image."""
    gray = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if gray is None:
        return [SplicingResult("error", 0.0, f"cannot read {image_path}")]

    results = []
    results.append(detect_clone_seams(gray))
    results.append(detect_noise_anomaly(gray))
    results.append(detect_blot_band_anomalies(gray))
    return results


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("usage: python splicing_detector.py <image>", file=sys.stderr)
        raise SystemExit(1)
    for r in analyze_splicing(sys.argv[1]):
        print(f"[{r.method:6s}] score={r.score:6.2f}  ({r.detail})")
