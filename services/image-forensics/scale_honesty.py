#!/usr/bin/env python3
"""
Honest stress analysis: would our forensics pipeline survive a Sci-Hub scale run?

Short answer: NO. Not yet. Here's why.
"""

SYNTHETIC = {
    "images": 13,
    "pairs": 78,
    "true_positives": 6,
    "precision": 0.833,
    "recall": 0.833,
    "f1": 0.833,
}

SCIHUB_SCALE = {
    "images": 100_000,
    "pairs": 4_999_950_000,  # n*(n-1)/2
    "estimated_true_manipulations": 50,  # optimistically, 0.05% of papers
}

FAILURE_MODES = {
    "pHash_template_collapse": {
        "cause": "All western blots share similar structure (lanes, bands, gray bg). On 100k images, thousands of unrelated blots will have hamming distance <=8 just from structural similarity.",
        "estimated_FP": "~20,000 false positive pairs from western blot structural similarity alone",
        "fix": "Pre-filter by image type. Only compare western blots to western blots when they're from the same lab/paper. Use panel segmentation first.",
    },
    "seam_detector_overfire": {
        "cause": "Multi-panel figures (90%+ of real scientific figures) have panel borders — legitimate lines between sub-figures. Current seam detector fires on ALL of them.",
        "estimated_FP": "~90,000 images flagged for 'seams' that are just panel borders",
        "fix": "Segment panels first, then only look for seams WITHIN panels, not at panel boundaries.",
    },
    "ELA_false_positives": {
        "cause": "Journal publication pipeline applies JPEG compression. Every published figure has a unique compression history. ELA will flag virtually all real figures.",
        "estimated_FP": "~95,000 images flagged for 'splicing' from normal journal compression",
        "fix": "Only use ELA on images known to originate from the same source file. Build a JPEG quality baseline per-journal.",
    },
    "SSIM_on_different_panels": {
        "cause": "Multiple panels showing the same experimental result (e.g., 3 replicates) have genuinely high structural similarity. SSIM >0.85 on related-but-legitimate panels.",
        "estimated_FP": "~5,000 pairs of related-but-legitimate experimental replicates",
        "fix": "Require SSIM >0.95 for flagging, or combine with other detectors.",
    },
}

print("=== HONEST ASSESSMENT: SCI-HUB SCALE RUN ===\n")

print(f"Synthetic benchmark: {SYNTHETIC['images']} images, {SYNTHETIC['pairs']} pairs")
print(f"  Precision: {SYNTHETIC['precision']:.1%}")
print(f"  Recall:    {SYNTHETIC['recall']:.1%}")
print(f"  F1:        {SYNTHETIC['f1']:.1%}")
print()

print(f"Sci-Hub scale:    {SCIHUB_SCALE['images']:,} images, {SCIHUB_SCALE['pairs']:,} pairs")
print(f"  Cannot compare all pairs — would take ~{SCIHUB_SCALE['pairs']/1000/3600/24:.0f} days at 1000 comparisons/sec")
print(f"  Need ANN indexing (FAISS) to pre-filter to likely matches only")
print()

print("=== AT SCALE, EACH DETECTOR BREAKS ===")
total_fp = 0
for name, info in FAILURE_MODES.items():
    fp_str = info["estimated_FP"]
    # Extract numeric from string like "~20,000 false..."
    import re
    nums = re.findall(r'[\d,]+', fp_str)
    fp = int(nums[0].replace(',', '')) if nums else 0
    total_fp += fp
    print(f"\n  {name}:")
    print(f"    {info['cause']}")
    print(f"    Est. false positives: {fp:,}")
    print(f"    Fix: {info['fix']}")

print(f"\n  TOTAL estimated false positives: {total_fp:,}")
print(f"  True positives (optimistic): ~{SCIHUB_SCALE['estimated_true_manipulations']}")
print(f"  Signal-to-noise ratio: {SCIHUB_SCALE['estimated_true_manipulations']}/{total_fp} = {SCIHUB_SCALE['estimated_true_manipulations']/total_fp:.5f}")
print(f"  (i.e., 99.96% of flags would be false positives)")
print()

print("=== WHAT WOULD MAKE IT WORK ===")
print("1. PANEL SEGMENTATION FIRST — segment multi-panel figures into individual panels")
print("2. ANN INDEXING (FAISS) — compare embeddings, not all pairs")
print("3. IMAGE-TYPE CLASSIFIER — only run appropriate detectors per image type")
print("4. JPG QUALITY BASELINE — per-journal/per-publisher compression profile")
print("5. LAB/PAPER SCOPING — compare within papers first, then within labs, then cross-literature")
print()
print("=== CURRENT TRUST LEVEL ===")
print("On synthetic data:    TRUST (83% F1)")
print("On real Dana-Farber figs: CAUTIOUS (copy-move found clone offsets, but seam/ELA overfire)")
print("On 100k Sci-Hub run:  DO NOT TRUST — would drown in false positives")
print()
print("=== WHAT TO DO INSTEAD ===")
print("A) Get RSIID dataset (39k real scientific figures with known forgeries) and benchmark there")
print("B) Build panel segmentation first, then re-run detectors on per-panel basis")
print("C) Use the Route A GPU pipeline pattern: embed everything with DINOv2, FAISS for ANN search")
print("D) Only flag pairs that have 2+ corroborating detectors with high per-detector scores")
print("E) Run on a SMALL verified corpus first (50 papers from one lab) before scaling")
