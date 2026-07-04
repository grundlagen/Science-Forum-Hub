#!/usr/bin/env python3
"""
Dana-Farber style manipulation test generator.
Creates synthetic figures matching the specific manipulation types
found in the DFCI papers, then tests our forensics pipeline against them.

Manipulation types (matched to DFCI case):
  1. Western blot lane duplication (Anderson KC papers)
  2. Band splicing/cloning (Firestein et al. 2008)
  3. Flow cytometry histogram reuse (Stewart et al. 2003)
  4. Rectangular region cloning (Firestein et al. 2008)
  5. Image panel reuse across contexts
"""
import cv2, numpy as np, json, sys, time
from pathlib import Path
import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "services" / "image-forensics"))

TEST_DIR = Path(__file__).resolve().parent.parent / "data" / "test_figures"
SYNTH_DIR = TEST_DIR / "synthetic"
SYNTH_DIR.mkdir(parents=True, exist_ok=True)

rng = np.random.default_rng(42)

def make_western_blot(seed, n_lanes=6, height=100, width=400):
    """Generate a realistic-looking western blot panel."""
    r = np.random.default_rng(seed)
    img = np.ones((height, width), dtype=np.uint8) * 220  # light gray background
    lane_w = width // (n_lanes + 1)
    for i in range(n_lanes):
        x = (i + 1) * lane_w - lane_w // 2
        for band in range(r.integers(2, 7)):
            bw = r.integers(8, 20)
            bh = r.integers(3, 10)
            by = r.integers(10, height - bh - 10)
            intensity = int(r.integers(20, 160))
            # Slight horizontal smear
            cv2.rectangle(img, (x - bw//2, by), (x + bw//2, by + bh), intensity, -1)
        # Lane boundary
        cv2.line(img, (x - lane_w//2, 5), (x - lane_w//2, height-5), 180, 1)
    return cv2.GaussianBlur(img, (3, 3), 0)

def make_flow_histogram(seed, width=400, height=200):
    """Generate a realistic flow cytometry histogram."""
    r = np.random.default_rng(seed)
    img = np.ones((height, width), dtype=np.uint8) * 250
    # Axes
    cv2.line(img, (40, height-30), (width-10, height-30), 0, 1)
    cv2.line(img, (40, height-30), (40, 10), 0, 1)
    # Histogram curves (1-3 populations)
    n_curves = r.integers(1, 4)
    for c in range(n_curves):
        points = []
        x_start = r.integers(80, 140)
        x_end = r.integers(250, width - 20)
        for x in range(x_start, x_end, 3):
            # Gaussian-ish curve
            mu = (x_start + x_end) / 2 + r.normal(0, 20)
            amp = r.integers(40, 120)
            sig = r.integers(15, 50)
            y = height - 35 - amp * np.exp(-((x - mu) / sig) ** 2)
            points.append((int(x), int(y + r.normal(0, 2))))
        pts = np.array(points, np.int32)
        cv2.polylines(img, [pts], False, (int(r.integers(0, 80)),), 1)
    # Labels
    cv2.putText(img, "Count", (5, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.4, 50, 1)
    cv2.putText(img, "FL1-H", (width-50, height-5), cv2.FONT_HERSHEY_SIMPLEX, 0.4, 50, 1)
    return img

def create_manipulations():
    """Generate the test set."""
    print("=== Generating Dana-Farber style test set ===\n")

    # === TEST 1: Western blot lane duplication ===
    print("TEST 1: Western blot lane duplication")
    blot1 = make_western_blot(1)
    blot2 = make_western_blot(2)
    # Duplicate lane: take lane 3 from blot1 and splice into lane 5 of blot2
    lane_w = blot1.shape[1] // 7
    dup_lane = blot1[:, 2*lane_w:3*lane_w].copy()
    blot2_dup = blot2.copy()
    blot2_dup[:, 4*lane_w:5*lane_w] = dup_lane
    cv2.imwrite(str(SYNTH_DIR / "blot_original_a.png"), blot1)
    cv2.imwrite(str(SYNTH_DIR / "blot_original_b.png"), blot2)
    cv2.imwrite(str(SYNTH_DIR / "blot_lane_duplicated.png"), blot2_dup)
    print("  Created: blot_original_a.png, blot_original_b.png, blot_lane_duplicated.png")
    print("  Expected: pHash should flag a<->b (similar structure)")
    print("  Expected: ORB should detect lane 3 of A in lane 5 of B\n")

    # === TEST 2: Band cloning (rectangular region copy-paste) ===
    print("TEST 2: Rectangular region cloning")
    blot3 = make_western_blot(3, n_lanes=4, height=120)
    # Clone a band region from lane 2 to lane 4
    clone_src = blot3[35:45, 100:120].copy()
    blot3_cloned = blot3.copy()
    blot3_cloned[35:45, 270:290] = clone_src
    cv2.imwrite(str(SYNTH_DIR / "blot_clone_original.png"), blot3)
    cv2.imwrite(str(SYNTH_DIR / "blot_clone_manipulated.png"), blot3_cloned)
    print("  Created: blot_clone_original.png, blot_clone_manipulated.png")
    print("  Expected: copy-move detector should find cloned region")
    print("  Expected: ELA should show anomalous compression region\n")

    # === TEST 3: Flow cytometry histogram duplication ===
    print("TEST 3: Flow cytometry histogram duplication")
    flow1 = make_flow_histogram(10)
    flow2 = make_flow_histogram(11)
    # Reuse flow1's curve in flow2
    flow1_dup = flow1.copy()
    flow2_reuse = flow2.copy()
    flow2_reuse = cv2.addWeighted(flow2_reuse, 0.7, flow1_dup, 0.3, 0)
    cv2.imwrite(str(SYNTH_DIR / "flow_original_a.png"), flow1)
    cv2.imwrite(str(SYNTH_DIR / "flow_original_b.png"), flow2)
    cv2.imwrite(str(SYNTH_DIR / "flow_curve_reused.png"), flow2_reuse)
    print("  Created: flow_original_a.png, flow_original_b.png, flow_curve_reused.png")
    print("  Expected: DINOv2/CLIP embedding similarity should flag\n")

    # === TEST 4: Image panel reuse (same image, different context) ===
    print("TEST 4: Image panel reuse across contexts")
    base = make_western_blot(20, n_lanes=3, height=80, width=200)
    # Add different annotations/borders
    reuse1 = base.copy()
    cv2.putText(reuse1, "Fig 1A: Control", (5, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.3, 0, 1)
    reuse2 = base.copy()
    cv2.putText(reuse2, "Fig 3B: Treatment", (5, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.3, 0, 1)
    cv2.rectangle(reuse2, (2, 2), (197, 77), 100, 1)
    cv2.imwrite(str(SYNTH_DIR / "panel_reuse_fig1a.png"), reuse1)
    cv2.imwrite(str(SYNTH_DIR / "panel_reuse_fig3b.png"), reuse2)
    print("  Created: panel_reuse_fig1a.png, panel_reuse_fig3b.png")
    print("  Expected: pHash should flag (near-duplicate, different label)")
    print("  Expected: DINOv2 should show high cosine similarity\n")

    # === TEST 5: Clean negatives ===
    print("TEST 5: Clean negative controls")
    clean1 = make_western_blot(100)
    clean2 = make_western_blot(101)
    clean3 = make_flow_histogram(102)
    cv2.imwrite(str(SYNTH_DIR / "clean_blot_1.png"), clean1)
    cv2.imwrite(str(SYNTH_DIR / "clean_blot_2.png"), clean2)
    cv2.imwrite(str(SYNTH_DIR / "clean_flow_1.png"), clean3)
    print("  Created: clean_blot_1.png, clean_blot_2.png, clean_flow_1.png")
    print("  Expected: No false positives on clean pairs\n")

    return SYNTH_DIR

def run_forensics_tests(synth_dir: Path):
    """Run the full forensics pipeline on the test set."""
    print("\n" + "=" * 60)
    print("RUNNING FORENSICS PIPELINE")
    print("=" * 60)

    try:
        import detector
        import forensics
        import advanced_detector
    except ImportError as e:
        print(f"Import error: {e}")
        print("Running basic tests only...")
        return run_basic_tests(synth_dir)

    # Load images
    images = detector.load_images(synth_dir)
    print(f"\nLoaded {len(images)} images from {synth_dir}")

    # === 1. Cross-image pHash detection ===
    print("\n--- pHash Detection ---")
    names = list(images.keys())
    phash_findings = detector.phash_findings(synth_dir, names)
    if phash_findings:
        for f in phash_findings:
            print(f"  [PHASH] {f.a} <-> {f.b}: {f.detail}")
    else:
        print("  No pHash hits (above threshold)")

    # === 2. ORB+RANSAC region reuse ===
    print("\n--- ORB+RANSAC Detection ---")
    orb_findings = detector.orb_findings(images, names)
    if orb_findings:
        for f in orb_findings:
            print(f"  [ORB] {f.a} <-> {f.b}: {f.detail}")
    else:
        print("  No ORB+RANSAC hits")

    # === 3. Flip-invariant detection ===
    print("\n--- Flip-Invariant Detection ---")
    adv_findings = advanced_detector.scan(synth_dir)
    flip_only = [f for f in adv_findings if "flip" in f.method]
    if flip_only:
        for f in flip_only:
            print(f"  [FLIP] {f.a} <-> {f.b}: {f.detail}")
    else:
        print("  No flip-invariant hits")

    # === 4. Intra-image copy-move ===
    print("\n--- Intra-Image Copy-Move Detection ---")
    for name, img in sorted(images.items()):
        result = forensics.intra_image_copy_move(img)
        if result.score > 0:
            print(f"  [COPY-MOVE] {name}: score={result.score:.0f} ({result.detail})")

    # === 5. ELA splice detection ===
    print("\n--- ELA Splice Detection ---")
    from PIL import Image
    for p in sorted(synth_dir.glob("*.png")):
        result = forensics.ela_score(Image.open(p))
        if result.score > 10:
            print(f"  [ELA] {p.name}: score={result.score:.0f} ({result.detail})")

    # === SUMMARY ===
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    n_ph = len(phash_findings)
    n_orb = len(orb_findings)
    n_flip = len(flip_only)
    n_cm = sum(1 for n, img in images.items() if forensics.intra_image_copy_move(img).score > 0)
    n_ela = sum(1 for p in synth_dir.glob("*.png") if forensics.ela_score(Image.open(p)).score > 10)
    print(f"  pHash hits:     {n_ph}")
    print(f"  ORB+RANSAC:     {n_orb}")
    print(f"  Flip-invariant: {n_flip}")
    print(f"  Copy-move:      {n_cm}")
    print(f"  ELA:            {n_ela}")
    print(f"  Total signals:  {n_ph + n_orb + n_flip + n_cm + n_ela}")
    print(f"  Expected TP:    >=4 (lane dup, clone, curve reuse, panel reuse)")
    print(f"  Expected FP:    0 (clean negatives should not fire)")

def run_basic_tests(synth_dir):
    """Fallback: run imagehash-based comparison."""
    import imagehash
    from PIL import Image
    print(f"\nBasic comparison (imagehash only):")
    files = sorted(synth_dir.glob("*.png"))
    for i, f1 in enumerate(files):
        for f2 in files[i+1:]:
            h1 = imagehash.phash(Image.open(f1))
            h2 = imagehash.phash(Image.open(f2))
            dist = h1 - h2
            if dist <= 30:
                print(f"  {f1.name:30s} <-> {f2.name:30s}  hamming={dist}")

if __name__ == "__main__":
    synth_dir = create_manipulations()
    run_forensics_tests(synth_dir)
