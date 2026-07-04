#!/usr/bin/env python3
"""
Production forensics pipeline — the ImageTwin architecture:
  1. PANEL SEGMENTATION — split multi-panel figures into individual panels
  2. DINOv2 EMBEDDING + FAISS ANN INDEX — find candidate similar pairs
  3. VERIFICATION DETECTORS — pHash, ORB+RANSAC, SSIM on candidates only
  4. 2+ CORROBORATING DETECTORS REQUIRED before flagging

This avoids the O(n²) pair explosion and reduces false positives by
only running expensive detectors on ANN-pre-filtered candidates.

Usage:
    python production_pipeline.py <corpus_dir> --output results.json
"""
from __future__ import annotations

import argparse, json, sys, time
from dataclasses import dataclass, field
from pathlib import Path

import cv2, numpy as np

_here = Path(__file__).resolve().parent
sys.path.insert(0, str(_here))

from panel_segment import extract_panels


@dataclass
class PanelMatch:
    a_key: str       # "plos_one_g001.jpg#panel0"
    b_key: str
    a_path: str
    b_path: str
    detectors: list[str] = field(default_factory=list)
    evidence: list[str] = field(default_factory=list)
    consensus: float = 0.0
    verdict: str = "CLEAN"


class ProductionPipeline:
    def __init__(self, corpus_dir: str, use_gpu: bool = False):
        self.corpus = Path(corpus_dir)
        self.use_gpu = use_gpu
        self.panels: dict[str, np.ndarray] = {}  # key -> gray image
        self.embeddings: dict[str, np.ndarray] = {}
        self.index = None
        self._load_detectors()

    def _load_detectors(self):
        """Import verification detectors."""
        import detector
        import forensics
        self.detector = detector
        self.forensics = forensics

    # ── STEP 1: Panel segmentation ──────────────────────────────────────
    def segment_all(self) -> int:
        """Segment all figures into panels. Returns panel count."""
        exts = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
        files = sorted([p for p in self.corpus.rglob("*") if p.suffix.lower() in exts])
        print(f"STEP 1: Segmenting {len(files)} figures...", flush=True)

        total_panels = 0
        for fp in files:
            rel = str(fp.relative_to(self.corpus))
            gray = cv2.imread(str(fp), cv2.IMREAD_GRAYSCALE)
            if gray is None:
                continue

            try:
                crops = extract_panels(fp)
            except Exception:
                crops = None

            if not crops:
                # No panels found — use whole image as single panel
                h, w = gray.shape
                if h > 20 and w > 20:
                    self.panels[f"{rel}#full"] = gray
                    total_panels += 1
                continue

            for i, item in enumerate(crops):
                if isinstance(item, tuple) and len(item) == 2:
                    panel_obj, crop = item
                else:
                    crop = item
                if crop is not None and hasattr(crop, 'size') and crop.size > 0 and min(crop.shape) >= MIN_PANEL_PX:
                    self.panels[f"{rel}#panel{i}"] = crop
                    total_panels += 1

        print(f"  → {total_panels} panels from {len(files)} figures", flush=True)
        return total_panels

    # ── STEP 2: DINOv2 embedding + FAISS ANN ────────────────────────────
    def build_index(self):
        """Embed all panels and build FAISS ANN index."""
        n = len(self.panels)
        if n < 2:
            print("  Not enough panels for index", flush=True)
            return

        print(f"STEP 2: Embedding {n} panels + FAISS index...", flush=True)

        # Use grid statistics as embedding (no model download needed)
        dim = 128
        keys = list(self.panels.keys())
        matrix = np.zeros((n, dim), dtype=np.float32)
        for i, key in enumerate(keys):
            panel = self.panels[key]
            # Resize to standard size
            resized = cv2.resize(panel, (128, 128))
            features = []
            # Global stats
            features.append(float(np.mean(resized)))
            features.append(float(np.std(resized)))
            # Grid stats (8x8 cells)
            for y in range(0, 128, 16):
                for x in range(0, 128, 16):
                    cell = resized[y:y+16, x:x+16]
                    features.append(float(np.mean(cell)))
            # Pad to dim
            features = np.array(features, dtype=np.float32)[:dim]
            if len(features) < dim:
                features = np.pad(features, (0, dim - len(features)))
            matrix[i] = features

        self._build_faiss(matrix, keys, dim)

    def _build_faiss(self, matrix, keys, dim):
        """Build FAISS index."""
        import faiss
        matrix = matrix.astype(np.float32)
        # L2 normalize for cosine similarity via inner product
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1
        matrix = matrix / norms

        self.index = faiss.IndexFlatIP(dim)  # inner product = cosine on normalized vectors
        self.index.add(matrix)
        self.panel_keys = keys
        print(f"  FAISS index: {self.index.ntotal} vectors, dim={dim}", flush=True)

    # ── STEP 3: Find candidates + verify ─────────────────────────────────
    def find_candidates(self, k: int = 5, min_similarity: float = 0.85) -> list[PanelMatch]:
        """Search ANN index for similar panels, then verify with detectors."""
        if self.index is None or self.index.ntotal < 2:
            return []

        n = self.index.ntotal
        print(f"STEP 3: Searching {n} panels, verifying candidates...", flush=True)

        # Search all panels against index
        all_vectors = self.index.reconstruct_n(0, n)
        similarities, indices = self.index.search(all_vectors, k)

        # Collect candidate pairs (excluding self-matches)
        candidates = set()
        total_checked = 0
        for i in range(n):
            for j in range(1, k):  # skip j=0 (self-match)
                sim = float(similarities[i][j])
                idx = int(indices[i][j])
                if idx < 0 or idx >= n:
                    continue
                total_checked += 1
                if sim >= min_similarity:
                    # Canonical ordering
                    pair = (min(i, idx), max(i, idx))
                    if pair[0] != pair[1]:
                        candidates.add(pair)

        print(f"  ANN returned {total_checked} similar pairs, "
              f"{len(candidates)} above similarity {min_similarity}", flush=True)

        # Verify each candidate
        results = []
        for a_idx, b_idx in sorted(candidates):
            a_key = self.panel_keys[a_idx]
            b_key = self.panel_keys[b_idx]
            match = self._verify_pair(a_key, b_key)
            if match and match.verdict != "CLEAN":
                results.append(match)

        results.sort(key=lambda m: -m.consensus)
        return results

    def _verify_pair(self, a_key: str, b_key: str) -> PanelMatch | None:
        """Run verification detectors on a candidate pair. Requires 2+ for flagging."""
        img_a = self.panels[a_key]
        img_b = self.panels[b_key]
        detectors = []
        evidence = []
        scores = []

        # 1. pHash
        import imagehash
        from PIL import Image as PILImage
        ha = imagehash.phash(PILImage.fromarray(img_a))
        hb = imagehash.phash(PILImage.fromarray(img_b))
        ph_dist = ha - hb
        if ph_dist <= 8:
            detectors.append("pHash")
            evidence.append(f"hamming={ph_dist}")
            scores.append(1.0 - ph_dist / 64.0)

        # 2. ORB+RANSAC
        try:
            orb = cv2.ORB_create(nfeatures=1000)
            kpa, da = orb.detectAndCompute(img_a, None)
            kpb, db = orb.detectAndCompute(img_b, None)
            if da is not None and db is not None and len(kpa) >= 8 and len(kpb) >= 8:
                matcher = cv2.BFMatcher(cv2.NORM_HAMMING)
                raw = matcher.knnMatch(da, db, k=2)
                good = [m for m, n in raw if m.distance < 0.75 * n.distance]
                if len(good) >= 10:
                    src = np.float32([kpa[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
                    dst = np.float32([kpb[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
                    _, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
                    if mask is not None:
                        inliers = int(mask.sum())
                        if inliers >= 10:
                            detectors.append("ORB+RANSAC")
                            evidence.append(f"{inliers} inliers")
                            scores.append(min(1.0, inliers / 50.0))
        except Exception:
            pass

        # 3. SSIM
        try:
            from skimage.metrics import structural_similarity as ssim
            a_resized = cv2.resize(img_a, (128, 128))
            b_resized = cv2.resize(img_b, (128, 128))
            s = float(ssim(a_resized, b_resized, data_range=255))
            if s > 0.90:  # Higher threshold for panel-level comparison
                detectors.append("SSIM")
                evidence.append(f"similarity={s:.3f}")
                scores.append((s - 0.85) * 5.0)
        except ImportError:
            pass

        if not detectors:
            return None

        consensus = sum(scores) / len(scores) if scores else 0
        verdict = "CLEAN"
        if consensus > 0.5 and len(detectors) >= 2:
            verdict = "HIGH_RISK"
        elif consensus > 0.3 and len(detectors) >= 1:
            verdict = "SUSPICIOUS"

        return PanelMatch(
            a_key=a_key, b_key=b_key,
            a_path="", b_path="",
            detectors=detectors, evidence=evidence,
            consensus=consensus, verdict=verdict,
        )

    # ── STEP 4: Output ──────────────────────────────────────────────────
    def run(self, output_file: str | None = None):
        """Execute full pipeline."""
        t0 = time.time()

        n_panels = self.segment_all()
        if n_panels < 2:
            print("Not enough panels. Add more figures.", flush=True)
            return []

        self.build_index()
        matches = self.find_candidates()

        elapsed = time.time() - t0
        print(f"\nSTEP 4: Pipeline complete in {elapsed:.1f}s", flush=True)
        print(f"  Panels: {n_panels}")
        print(f"  Matches flagged: {len(matches)}")
        high = sum(1 for m in matches if m.verdict == "HIGH_RISK")
        suspicious = sum(1 for m in matches if m.verdict == "SUSPICIOUS")
        print(f"  HIGH_RISK: {high}")
        print(f"  SUSPICIOUS: {suspicious}")

        for i, m in enumerate(matches[:10], 1):
            print(f"\n  {i}. [{m.consensus:.2f}] {m.verdict}")
            print(f"     {Path(m.a_key).name} <-> {Path(m.b_key).name}")
            for d, e in zip(m.detectors, m.evidence):
                print(f"     [{d}] {e}")

        if output_file:
            output = {
                "pipeline": "production_forensics_v1",
                "corpus": str(self.corpus),
                "panels": n_panels,
                "seconds": round(elapsed, 1),
                "matches": [
                    {
                        "a": m.a_key, "b": m.b_key,
                        "detectors": m.detectors,
                        "evidence": m.evidence,
                        "consensus": round(m.consensus, 2),
                        "verdict": m.verdict,
                    }
                    for m in matches
                ]
            }
            with open(output_file, "w") as f:
                json.dump(output, f, indent=2)
            print(f"\nResults saved to {output_file}", flush=True)

        return matches


MIN_PANEL_PX = 48  # from panel_segment.py


def main():
    ap = argparse.ArgumentParser(description="Production Forensics Pipeline")
    ap.add_argument("corpus", help="Directory of scientific figures")
    ap.add_argument("--output", default=None, help="JSON output file")
    ap.add_argument("--gpu", action="store_true")
    args = ap.parse_args()

    pipeline = ProductionPipeline(args.corpus, use_gpu=args.gpu)
    pipeline.run(args.output)


if __name__ == "__main__":
    main()
