#!/usr/bin/env python3
"""
Cross-image comparison engine — the real forensic power.
Compares images within a corpus to find duplications, region reuse,
and cross-paper patterns that single-image analysis cannot detect.

This is what ImageTwin's cross-literature index does at scale.
We run it on a local corpus (e.g., all figures from one paper/lab).

Iteration 2 improvements:
  - Sized-scored seam detection (localized vs full-span)
  - Cross-image pair ranking by evidence strength
  - Consensus scoring across multiple detector types
  - Ground-truth comparison mode
"""
from __future__ import annotations

import json, sys
from dataclasses import dataclass, field
from pathlib import Path
from itertools import combinations

import cv2, numpy as np

_here = Path(__file__).resolve().parent
sys.path.insert(0, str(_here))

try:
    import detector
    import forensics
    import splicing_detector as sd
    HAS_ALL = True
except ImportError as e:
    HAS_ALL = False
    print(f"Warning: {e}", file=sys.stderr)


@dataclass
class PairFinding:
    a: str
    b: str
    detectors: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)
    consensus_score: float = 0.0
    verdict: str = "CLEAN"

    def to_dict(self) -> dict:
        return {
            "a": self.a, "b": self.b,
            "detectors": self.detectors,
            "evidence": self.evidence,
            "consensus_score": round(self.consensus_score, 2),
            "verdict": self.verdict,
        }


def cross_compare(folder: str, ground_truth: dict = None) -> list[PairFinding]:
    """
    Compare all image pairs in a folder using multiple detectors.
    Returns ranked list of pair findings with consensus scores.

    If ground_truth is provided (mapping frozenset({a,b}) -> True/False),
    output includes precision/recall metrics (Iteration 3).
    """
    images = detector.load_images(Path(folder))
    names = sorted(images.keys())
    findings = []

    print(f"Cross-comparing {len(names)} images ({len(names)*(len(names)-1)//2} pairs)...",
          file=sys.stderr)

    phash_hits = detector.phash_findings(Path(folder), names)
    orb_hits = detector.orb_findings(images, names)

    # Build lookup
    phash_map = {}
    for f in phash_hits:
        key = frozenset({f.a, f.b})
        phash_map[key] = f

    orb_map = {}
    for f in orb_hits:
        key = frozenset({f.a, f.b})
        orb_map[key] = f

    # SSIM cache for structural similarity (Iteration 3)
    ssim_cache = {}

    # Check all pairs
    for a, b in combinations(names, 2):
        detectors_hit = []
        evidence = []
        scores = []

        # pHash
        ph = phash_map.get(frozenset({a, b}))
        if ph and ph.score > 0:
            detectors_hit.append("pHash")
            evidence.append(ph.detail)
            scores.append(ph.score / 100.0)

        # ORB+RANSAC
        orb = orb_map.get(frozenset({a, b}))
        if orb and orb.score > 0:
            detectors_hit.append("ORB+RANSAC")
            evidence.append(orb.detail)
            scores.append(min(1.0, orb.score / 50.0))

        # Intra-image copy-move (single-image check)
        cm_a = forensics.intra_image_copy_move(images[a])
        cm_b = forensics.intra_image_copy_move(images[b])
        if cm_a.score > 0:
            detectors_hit.append(f"copy-move({a})")
            evidence.append(cm_a.detail)
            scores.append(min(1.0, cm_a.score / 100.0))
        if cm_b.score > 0:
            detectors_hit.append(f"copy-move({b})")
            evidence.append(cm_b.detail)
            scores.append(min(1.0, cm_b.score / 100.0))

        # SSIM — structural similarity (Iteration 3: catches panel reuse with text overlay)
        try:
            from skimage.metrics import structural_similarity as ssim
            key_ab = (a, b)
            if key_ab not in ssim_cache:
                img_a = cv2.resize(images[a], (256, 256))
                img_b = cv2.resize(images[b], (256, 256))
                ssim_cache[key_ab] = float(ssim(img_a, img_b, data_range=255))
            ssim_val = ssim_cache[key_ab]
            if ssim_val > 0.85:  # Very high structural similarity = likely same image
                detectors_hit.append("SSIM")
                evidence.append(f"structural similarity={ssim_val:.3f}")
                scores.append((ssim_val - 0.80) * 5.0)  # scale 0.85->0.25, 1.0->1.0
        except ImportError:
            pass

        # Consensus score
        if scores:
            consensus = sum(scores) / max(1, len(scores))
        else:
            consensus = 0.0

        verdict = "CLEAN"
        if consensus > 0.6 and len(detectors_hit) >= 2:
            verdict = "HIGH_RISK"
        elif consensus > 0.3:
            verdict = "SUSPICIOUS"

        if detectors_hit:
            findings.append(PairFinding(
                a=a, b=b,
                detectors=detectors_hit,
                evidence=evidence,
                consensus_score=consensus,
                verdict=verdict,
            ))

    findings.sort(key=lambda f: -f.consensus_score)

    # Ground truth evaluation
    if ground_truth:
        tp = fp = fn = 0
        for f in findings:
            key = frozenset({Path(f.a).stem, Path(f.b).stem})
            is_real = ground_truth.get(key, False)
            flagged = f.verdict != "CLEAN"
            if flagged and is_real:
                tp += 1
            elif flagged and not is_real:
                fp += 1
            elif not flagged and is_real:
                fn += 1

        # Count missed pairs
        all_real = sum(1 for v in ground_truth.values() if v)
        missed = all_real - tp - fn  # pairs not in findings at all

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall = tp / (tp + fn + missed) if (tp + fn + missed) > 0 else 0

        print(f"\n{'='*50}", file=sys.stderr)
        print(f"GROUND TRUTH EVALUATION", file=sys.stderr)
        print(f"  True Positives:  {tp}", file=sys.stderr)
        print(f"  False Positives: {fp}", file=sys.stderr)
        print(f"  False Negatives: {fn}", file=sys.stderr)
        print(f"  Missed entirely: {missed}", file=sys.stderr)
        print(f"  Precision: {precision:.1%}", file=sys.stderr)
        print(f"  Recall:    {recall:.1%}", file=sys.stderr)
        print(f"  F1:        {2*precision*recall/(precision+recall) if (precision+recall) > 0 else 0:.1%}", file=sys.stderr)

    return findings


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Cross-image comparison engine")
    ap.add_argument("folder", help="Folder of images to compare")
    ap.add_argument("--json", action="store_true", help="JSON output")
    ap.add_argument("--ground-truth", help="JSON file with ground truth pairs")
    args = ap.parse_args()

    gt = None
    if args.ground_truth:
        gt = {}
        with open(args.ground_truth) as f:
            raw = json.load(f)
            for entry in raw:
                key = frozenset({entry["a"], entry["b"]})
                gt[key] = entry.get("manipulated", False)

    findings = cross_compare(args.folder, ground_truth=gt)

    if args.json:
        print(json.dumps([f.to_dict() for f in findings], indent=2))
    else:
        for i, f in enumerate(findings, 1):
            print(f"\n{i:3d}. [{f.consensus_score:.2f}] {f.verdict}")
            print(f"     {f.a}  <->  {f.b}")
            for d, e in zip(f.detectors, f.evidence):
                print(f"     [{d}] {e}")

        print(f"\n{len(findings)} flagged pairs out of all comparisons.")


if __name__ == "__main__":
    main()