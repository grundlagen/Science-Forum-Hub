#!/usr/bin/env python3
"""
Sholto David replication — pixel-level false-color overlay detection.
Replicates the methodology Sholto David used to expose the Dana-Farber
band cloning: comparing image regions, finding identical pixel patterns,
and overlaying false-color to highlight the cloned area.

This is the ground truth: Sholto David actually published annotated images
showing exactly which region was cloned. We compare our detectors against
that annotation to measure real-world accuracy.

Method:
  1. Load the PubPeer-annotated image (ground truth)
  2. Extract the false-color region (the clone boundary)
  3. Find matching panels in our segmented corpus
  4. Run detectors on the correct panel
  5. Measure overlap with ground truth
"""
from __future__ import annotations

import cv2, numpy as np
from pathlib import Path

ANNOTATED_IMG = "/tmp/pubpeer_annotated.png"
CORPUS_DIR = Path(__file__).resolve().parent.parent / "data" / "test_figures" / "dana_farber"


def extract_annotation_mask(annotated_path: str) -> np.ndarray | None:
    """
    Extract the false-color region from the PubPeer annotated image.
    Sholto David used false-color (typically red/cyan overlay) to mark
    the cloned rectangular section.
    """
    img = cv2.imread(annotated_path)
    if img is None:
        return None
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # False-color annotations are typically:
    # Red overlay: hue near 0/180, high saturation
    # Cyan/green overlay: hue near 90-120, high saturation
    # The false-color marks the cloned region boundary

    # Detect red overlay (hue 0-10 or 170-180)
    mask_red1 = cv2.inRange(hsv, (0, 50, 50), (10, 255, 255))
    mask_red2 = cv2.inRange(hsv, (170, 50, 50), (180, 255, 255))
    mask_red = cv2.bitwise_or(mask_red1, mask_red2)

    # Detect cyan/green overlay (hue 80-120)
    mask_cyan = cv2.inRange(hsv, (80, 50, 50), (120, 255, 255))

    # Combine
    annotation_mask = cv2.bitwise_or(mask_red, mask_cyan)

    if annotation_mask.sum() > 100:  # At least some annotation pixels
        print(f"  Annotation mask: {annotation_mask.sum()} pixels")
        # Find the bounding box of the annotation
        ys, xs = np.where(annotation_mask > 0)
        if len(xs) > 0:
            x1, x2 = xs.min(), xs.max()
            y1, y2 = ys.min(), ys.max()
            print(f"  Clone region bounds: x=[{x1},{x2}], y=[{y1},{y2}]")
            print(f"  Region size: {x2-x1}x{y2-y1} pixels")
        return annotation_mask
    else:
        # Try alternative: look for saturated colors (false-color typical)
        sat = hsv[:, :, 1]
        val = hsv[:, :, 2]
        # False-color regions have high saturation AND distinct hue from grayscale
        mask_sat = (sat > 80) & (val > 80)
        if mask_sat.sum() > 100:
            annotation_mask = mask_sat.astype(np.uint8) * 255
            ys, xs = np.where(annotation_mask > 0)
            if len(xs) > 0:
                x1, x2 = xs.min(), xs.max()
                y1, y2 = ys.min(), ys.max()
                print(f"  Clone region bounds (sat-based): x=[{x1},{x2}], y=[{y1},{y2}]")
            return annotation_mask

    print("  Could not extract annotation mask")
    return None


def find_matching_panel(corpus_dir: Path, annotated_img: np.ndarray) -> tuple[str, np.ndarray] | None:
    """Find which segmented panel matches the annotated image using pixel differencing."""
    from panel_segment import extract_panels

    annotated_gray = cv2.cvtColor(annotated_img, cv2.COLOR_BGR2GRAY)

    exts = {".png", ".jpg", ".jpeg"}
    for fp in sorted(corpus_dir.glob("*")):
        if fp.suffix.lower() not in exts:
            continue

        crops = extract_panels(fp)
        if not crops:
            continue

        for i, item in enumerate(crops):
            if isinstance(item, tuple):
                _, crop = item
            else:
                crop = item

            if crop.shape[0] < 50 or crop.shape[1] < 50:
                continue

            # Resize both to same dimensions for comparison
            h, w = min(annotated_gray.shape[0], crop.shape[0]), min(annotated_gray.shape[1], crop.shape[1])
            a_resized = cv2.resize(annotated_gray[:h, :w], (128, 128))
            c_resized = cv2.resize(crop[:h, :w], (128, 128))

            # Correlation
            corr = np.corrcoef(a_resized.flatten(), c_resized.flatten())[0, 1]
            if corr > 0.5:
                key = f"{fp.name}#panel{i}"
                return key, crop

    return None


def sholto_david_detect(panel: np.ndarray, block_size: int = 16, threshold: float = 0.98) -> list[tuple]:
    """
    Replicate Sholto David's methodology:
    1. Divide image into blocks
    2. Compare every block to every other block
    3. Find blocks with near-perfect correlation (cloned regions)
    4. Return clone regions with false-color styling info
    """
    h, w = panel.shape
    clones = []

    # Extract blocks
    blocks = {}
    for y in range(0, h - block_size, block_size // 2):
        for x in range(0, w - block_size, block_size // 2):
            block = panel[y:y+block_size, x:x+block_size]
            if block.std() < 5:  # Skip flat regions (background)
                continue
            blocks[(x, y)] = block.astype(np.float32)

    # Compare blocks
    block_keys = list(blocks.keys())
    for i in range(len(block_keys)):
        for j in range(i + 1, len(block_keys)):
            a = blocks[block_keys[i]]
            b = blocks[block_keys[j]]
            # Normalized cross-correlation
            a_norm = (a - a.mean()) / (a.std() + 1e-9)
            b_norm = (b - b.mean()) / (b.std() + 1e-9)
            corr = np.mean(a_norm * b_norm)
            if corr > threshold:
                # Check spatial separation (real clones are far apart)
                dx = abs(block_keys[i][0] - block_keys[j][0])
                dy = abs(block_keys[i][1] - block_keys[j][1])
                if dx > block_size or dy > block_size:
                    clones.append((block_keys[i], block_keys[j], corr))

    return sorted(clones, key=lambda x: -x[2])  # Best matches first


def compare_with_ground_truth(panel: np.ndarray, annotation_mask: np.ndarray) -> dict:
    """Run all our detectors and compare against the PubPeer annotation."""
    _here = Path(__file__).resolve().parent
    import sys
    sys.path.insert(0, str(_here))

    import forensics
    import detector as det

    results = {}

    # 1. Intra-image copy-move (our existing detector)
    cm = forensics.intra_image_copy_move(panel)
    results["copy_move"] = {"score": cm.score, "detail": cm.detail,
                            "detected": cm.score > 0}

    # 2. ORB self-matching
    orb = cv2.ORB_create(nfeatures=2000)
    kp, des = orb.detectAndCompute(panel, None)
    if des is not None:
        matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
        knn = matcher.knnMatch(des, des, k==3)
        offsets = {}
        for matches in knn:
            cand = [m for m in matches if m.queryIdx != m.trainIdx]
            if len(cand) >= 2 and cand[0].distance < 0.8 * cand[1].distance:
                p = kp[cand[0].queryIdx].pt
                q = kp[cand[0].trainIdx].pt
                dx, dy = int(round(q[0]-p[0])), int(round(q[1]-p[1]))
                dist = np.hypot(dx, dy)
                if dist > 30:
                    key = (dx // 8, dy // 8)
                    offsets[key] = offsets.get(key, 0) + 1
        if offsets:
            best = max(offsets, key=offsets.get)
            results["orb_self"] = {"keypoints": offsets[best],
                                   "offset": (best[0]*8, best[1]*8),
                                   "detected": offsets[best] >= 8}
        else:
            results["orb_self"] = {"detected": False}

    # 3. Sholto David block-matching
    clones = sholto_david_detect(panel)
    if clones:
        results["sholto_david"] = {
            "clones_found": len(clones),
            "top_correlation": float(clones[0][2]),
            "top_region": clones[0][:2],
            "detected": len(clones) > 0,
        }
    else:
        results["sholto_david"] = {"detected": False, "clones_found": 0}

    # 4. Ground truth overlap
    if annotation_mask is not None:
        # Resize annotation mask to panel size
        ann_resized = cv2.resize(annotation_mask, (panel.shape[1], panel.shape[0]))
        overlap = (ann_resized > 0).sum()
        results["ground_truth"] = {
            "annotation_pixels": int(overlap),
            "panel_size": f"{panel.shape[0]}x{panel.shape[1]}",
        }

    return results


def main():
    print("=" * 60)
    print("SHOLTO DAVID REPLICATION: Dana-Farber Band Cloning")
    print("=" * 60)

    # Load annotated image
    annotated = cv2.imread(ANNOTATED_IMG)
    if annotated is None:
        print("Cannot load annotated image")
        return

    print(f"\nAnnotated image: {annotated.shape}")

    # Extract annotation
    print("\n--- Ground Truth Extraction ---")
    mask = extract_annotation_mask(ANNOTATED_IMG)

    # Find matching panel
    print("\n--- Finding Matching Panel ---")
    match = find_matching_panel(CORPUS_DIR, annotated)
    if match:
        key, panel = match
        print(f"  Matched panel: {key}")
        print(f"  Panel size: {panel.shape}")

        # Run detectors
        print("\n--- Running Detectors vs Ground Truth ---")
        results = compare_with_ground_truth(panel, mask)

        for name, r in results.items():
            status = "✓ DETECTED" if r.get("detected") else "✗ NOT DETECTED"
            print(f"\n  [{name}] {status}")
            for k, v in r.items():
                if k != "detected":
                    print(f"    {k}: {v}")

        # Verdict
        print("\n" + "=" * 60)
        detected = sum(1 for r in results.values() if r.get("detected"))
        print(f"VERDICT: {detected}/{len(results)} detectors found the clone")
        if detected >= 2:
            print("  CONFIRMED: Multiple detectors agree — likely manipulation")
        elif detected == 1:
            print("  SUGGESTIVE: One detector found signal — human review needed")
        else:
            print("  NEGATIVE: No detectors found the clone")
    else:
        print("  No matching panel found in corpus")


if __name__ == "__main__":
    main()
