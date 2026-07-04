#!/usr/bin/env python3
"""
Sholto David Methodology Replication Report

Replicates Sholto David's image manipulation detection methodology
as described in his bioRxiv paper and blog posts, using our open-source
pipeline instead of ImageTwin.

Paper: "A Quantitative Study of Inappropriate Image Duplication in the
        Journal Toxicology Reports" (2023)
Key finding: 16% of papers had duplications; AI found 55% more than manual.

Detection categories Sholto David uses:
  1. Whole-panel duplication — same panel reused
  2. Within-panel band cloning — rectangular region cloned
  3. Lane duplication — one lane copied to another position
  4. Histogram/curve reuse — identical curves in different contexts
  5. Splicing — images stitched together unnaturally
"""
from pathlib import Path
import json, sys

_here = Path(__file__).resolve().parent
sys.path.insert(0, str(_here))

RESULTS = {
    "methodology": "Sholto David replication using open-source pipeline",
    "paper_reference": "10.1101/2023.09.03.556099",
    "sholto_key_finding": "16% duplication rate, AI found 55% more than manual",
    "test_corpus": "Firestein/Hahn/Sinclair PLoS ONE 2008 (10.1371/journal.pone.0002020)",
    "figures_analyzed": 6,
    "panels_segmented": 63,
    "embedding_model": "ResNet50 (ImageNet pretrained, 2048-dim)",
    "ann_method": "FAISS Inner Product (cosine similarity)",

    "detection_categories": {
        "1_whole_panel_duplication": {
            "description": "Same panel appears in multiple figures with different labels",
            "sholto_method": "Visual side-by-side comparison",
            "our_method": "pHash + SSIM cross-panel comparison",
            "detected": "PARTIAL",
            "evidence": "SSIM 0.873 for panel_reuse pair (synthetic). "
                       "Not detected on real figures — text overlays change pHash significantly.",
            "gap": "Need label-stripping before comparison, or DINOv2 embeddings robust to text",
        },
        "2_band_cloning": {
            "description": "Rectangular region cloned from nearby lane within a western blot",
            "sholto_method": "False-color overlay on PubPeer, showing identical pixel patterns",
            "our_method": "Copy-move self-matching (ORB), block correlation",
            "detected": "MISSED",
            "evidence": "PubPeer annotation exists (image-1648404213208.png) showing clone. "
                       "Our copy-move returned 0 hits — JPEG artifacts and small clone region (<20px) "
                       "defeat ORB self-matching.",
            "gap": "Need large-block NCC at multiple scales, or deep-learning pixel classifier",
        },
        "3_lane_duplication": {
            "description": "One western blot lane copied to another position",
            "sholto_method": "Visual comparison of lane band patterns",
            "our_method": "ORB+RANSAC cross-image matching",
            "detected": "YES",
            "evidence": "g003 panels 5-7: 184-216 ORB inliers. "
                       "g002 panels 4-5: 223 ORB inliers. "
                       "These are geometrically consistent matches suggesting duplicated blot regions.",
        },
        "4_flow_cytometry_duplication": {
            "description": "Identical histogram curves in different figures",
            "sholto_method": "Elisabeth Bik finding: overlay comparison of curve shapes",
            "our_method": "Band profile correlation (splicing_detector.py)",
            "detected": "NOT APPLICABLE",
            "evidence": "Stewart/Hahn RNA 2003 paper not in our test corpus. "
                       "Our synthetic test detected 0.977 correlation for reused curves.",
            "gap": "Need to download RNA 2003 figures for real-world test",
        },
        "5_splicing_detection": {
            "description": "Images stitched together with unnatural seams",
            "sholto_method": "Visual inspection of lane boundaries and background consistency",
            "our_method": "Seam detection (gradient discontinuity), noise variance analysis",
            "detected": "OVERFIRES",
            "evidence": "Seam detector fires on all figure panel borders (legitimate). "
                       "Cannot distinguish panel separators from clone seams.",
            "gap": "Panel-border awareness added but insufficient. Need panel segmentation FIRST, "
                   "then seam detection only WITHIN panels.",
        },
    },

    "sholto_vs_us": {
        "what_sholto_found_in_this_paper": [
            "Western blot band cloning: rectangular section cloned from nearby lane "
            "(annotated on PubPeer, false-color overlay published)",
        ],
        "what_we_found_in_this_paper": [
            "Lane duplication signals: g003 panels 5-7 at 184-216 ORB inliers",
            "Cross-figure panel matches: g002 panel 4,5 at 223 ORB inliers",
            "PubPeer clone annotation: EXISTS but our copy-move missed it",
        ],
        "what_sholto_would_find_that_we_miss": [
            "The specific cloned band region — requires human visual recognition",
            "Subtle background inconsistencies around clone boundaries",
            "Band intensity profiles that are too perfectly matched",
        ],
    },

    "recommendations": {
        "immediate": [
            "Run full pipeline on ALL papers from Sholto's Toxicology Reports study for direct replication",
            "Download Stewart/Hahn RNA 2003 figures for flow cytometry test",
            "Integrate RECOD Kaggle model weights when downloaded",
        ],
        "architecture": [
            "Replace ORB copy-move with deep-learning pixel classifier (FakeShield / RECOD model)",
            "Add label-stripping preprocessor for panel reuse detection",
            "Use DINOv2 instead of ResNet50 for domain-appropriate embeddings",
        ],
        "process": [
            "Always run 2-pass: ANN candidates -> verification -> human review",
            "Flag everything above 0.3 consensus for human review (not just HIGH_RISK)",
            "Save model weights to GDrive (sfh/models/) for reuse across sessions",
        ],
    },
}

print(json.dumps(RESULTS, indent=2))
with open("/tmp/sholto_replication_report.json", "w") as f:
    json.dump(RESULTS, f, indent=2)
print("\nReport saved to /tmp/sholto_replication_report.json")
