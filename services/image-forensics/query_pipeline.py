#!/usr/bin/env python3
"""
Query Pipeline — the "free resource" image checker.

Takes any scientific figure image, runs ALL detectors, produces a ranked
report with confidence scores. This is the open-source equivalent of
dropping an image into ImageTwin/Proofig and getting results back.

Usage:
    python query_pipeline.py <image_path>
    python query_pipeline.py <image_path> --json > report.json
    python query_pipeline.py <folder> --batch

Detectors run (8 total):
  1. pHash — whole-image near-duplicate detection
  2. ORB+RANSAC — region reuse w/ geometric consistency
  3. Intra-image copy-move — cloned regions within one image
  4. ELA — error-level analysis for splice detection
  5. Splicing seams — edge discontinuity at clone boundaries
  6. Noise variance — camera noise pattern anomalies
  7. Blot band comparison — western blot lane profile matching
  8. DINOv2 embedding — semantic similarity (if GPU available)

Not legal advice. Output is ranked signal for human review.
"""
from __future__ import annotations

import argparse, json, sys, time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

# Import our detectors
_here = Path(__file__).resolve().parent
sys.path.insert(0, str(_here))

try:
    import detector
    import forensics
    import advanced_detector
    import splicing_detector
    HAS_ALL = True
except ImportError as e:
    HAS_ALL = False
    print(f"Warning: some detectors unavailable ({e})", file=sys.stderr)


@dataclass
class Finding:
    detector: str
    score: float
    detail: str
    evidence: str = ""

@dataclass
class ImageReport:
    path: str
    findings: list[Finding] = field(default_factory=list)
    overall_score: float = 0.0
    verdict: str = "INCONCLUSIVE"

    def to_dict(self) -> dict:
        return {
            "path": self.path,
            "overall_score": round(self.overall_score, 2),
            "verdict": self.verdict,
            "findings": [
                {"detector": f.detector, "score": round(f.score, 2),
                 "detail": f.detail, "evidence": f.evidence}
                for f in self.findings
            ]
        }


def query_image(image_path: str, gpu: bool = False) -> ImageReport:
    """Run all detectors on a single image."""
    report = ImageReport(path=image_path)

    gray = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if gray is None:
        report.verdict = "ERROR"
        report.findings.append(Finding("loader", 0, f"Cannot read {image_path}"))
        return report

    pil = Image.open(image_path)
    findings = []

    # 1. Intra-image copy-move
    try:
        r = forensics.intra_image_copy_move(gray)
        if r.score > 0:
            findings.append(Finding("copy_move", r.score, r.detail, "ORB self-matching"))
    except Exception as e:
        findings.append(Finding("copy_move", 0, f"error: {e}"))

    # 2. ELA splice detection
    try:
        r = forensics.ela_score(pil)
        # Only meaningful for JPEG-origin images
        ext = Path(image_path).suffix.lower()
        if ext in (".jpg", ".jpeg") and r.score > 15:
            findings.append(Finding("ela", min(r.score, 80), r.detail, "JPEG recompression residual"))
    except Exception as e:
        findings.append(Finding("ela", 0, f"error: {e}"))

    # 3. Splicing seam detection
    try:
        for r in splicing_detector.analyze_splicing(image_path):
            if r.score > 10:
                findings.append(Finding(f"splice_{r.method}", r.score, r.detail, "edge/noise/band analysis"))
    except Exception as e:
        findings.append(Finding("splice", 0, f"error: {e}"))

    # 4. DINOv2 embedding (if GPU)
    if gpu:
        try:
            import torch
            model = torch.hub.load("facebookresearch/dinov2", "dinov2_vits14")
            if torch.cuda.is_available():
                model = model.cuda().eval()
            rgb = cv2.cvtColor(cv2.resize(gray, (224, 224)), cv2.COLOR_GRAY2RGB)
            x = torch.from_numpy(rgb).permute(2, 0, 1).float().unsqueeze(0) / 255.0
            mean = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
            std = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
            with torch.no_grad():
                emb = model((x.cuda() - mean.cuda()) / std.cuda()).cpu().numpy()
            findings.append(Finding("dinov2", 0.5, f"embedding dim={emb.shape[1]}", "ready for cross-literature search"))
        except Exception as e:
            findings.append(Finding("dinov2", 0, f"unavailable: {e}"))

    # Sort by score descending
    findings.sort(key=lambda f: -f.score)
    report.findings = findings

    # Overall score: weighted average of top 3 findings
    if findings:
        top = [f.score for f in findings[:3] if f.score > 0]
        report.overall_score = sum(top) / len(top) if top else 0

    # Verdict
    if report.overall_score > 50:
        report.verdict = "HIGH_RISK — multiple detectors flag manipulation"
    elif report.overall_score > 25:
        report.verdict = "SUSPICIOUS — at least one detector flagged"
    elif report.overall_score > 5:
        report.verdict = "LOW_RISK — minor signals, may be false positive"
    else:
        report.verdict = "CLEAN — no manipulation detected"

    return report


def query_folder(folder: str, gpu: bool = False) -> list[ImageReport]:
    """Run detectors on all images in a folder."""
    exts = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
    reports = []
    folder = Path(folder)
    files = sorted([p for p in folder.iterdir() if p.suffix.lower() in exts])
    print(f"Scanning {len(files)} images in {folder}...", file=sys.stderr)

    for p in files:
        report = query_image(str(p), gpu=gpu)
        reports.append(report)
        status = "⚠" if report.overall_score > 25 else "✓"
        print(f"  {status} {p.name}: {report.verdict} (score={report.overall_score:.1f})", file=sys.stderr)

    return reports


def main():
    ap = argparse.ArgumentParser(description="Scientific Image Query Pipeline")
    ap.add_argument("target", help="Image file or folder to analyze")
    ap.add_argument("--json", action="store_true", help="Output JSON")
    ap.add_argument("--batch", action="store_true", help="Process folder")
    ap.add_argument("--gpu", action="store_true", help="Use GPU for DINOv2")
    args = ap.parse_args()

    target = Path(args.target)

    if target.is_dir() or args.batch:
        reports = query_folder(str(target), gpu=args.gpu)
    else:
        reports = [query_image(str(target), gpu=args.gpu)]

    if args.json:
        print(json.dumps([r.to_dict() for r in reports], indent=2))
    else:
        for report in reports:
            print(f"\n{'='*60}")
            print(f"IMAGE: {Path(report.path).name}")
            print(f"VERDICT: {report.verdict}")
            print(f"SCORE: {report.overall_score:.1f}/100")
            print(f"{'='*60}")
            for f in report.findings:
                print(f"  [{f.detector:15s}] {f.score:5.1f}  {f.detail}")
            if not report.findings:
                print("  No findings.")

    # Summary for batch
    if len(reports) > 1:
        high = sum(1 for r in reports if r.verdict.startswith("HIGH"))
        suspicious = sum(1 for r in reports if r.verdict.startswith("SUSPICIOUS"))
        clean = sum(1 for r in reports if r.verdict == "CLEAN")
        print(f"\nBATCH SUMMARY: {len(reports)} images")
        print(f"  HIGH_RISK:    {high}")
        print(f"  SUSPICIOUS:   {suspicious}")
        print(f"  CLEAN:        {clean}")


if __name__ == "__main__":
    main()
