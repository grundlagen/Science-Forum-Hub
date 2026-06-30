"""
Stress test / benchmark for the image-duplication stack (detector.py cross-image
pHash + ORB/RANSAC, plus forensics.py intra-image copy-move). Generates clean panels
and many manipulation types, then measures recall (manipulations caught) and the
false-positive rate (unrelated clean panels wrongly flagged).
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import cv2
import numpy as np

import advanced_detector
import forensics


def blot_panel(seed: int, size: int = 320) -> np.ndarray:
    r = np.random.default_rng(seed)
    img = (r.normal(200, 12, (size, size)).clip(0, 255)).astype(np.uint8)
    for _ in range(6):
        x, y = r.integers(40, size - 80, 2)
        w, h = r.integers(30, 90, 2)
        cv2.ellipse(img, (int(x), int(y)), (int(w), int(h)), float(r.integers(0, 180)), 0, 360, int(r.integers(20, 90)), -1)
    for _ in range(220):
        x, y = r.integers(0, size, 2)
        cv2.circle(img, (int(x), int(y)), int(r.integers(1, 3)), int(r.integers(0, 60)), -1)
    for _ in range(12):
        x1, y1, x2, y2 = r.integers(0, size, 4)
        cv2.line(img, (int(x1), int(y1)), (int(x2), int(y2)), int(r.integers(0, 80)), 1)
    return cv2.GaussianBlur(img, (3, 3), 0)


def splice_region(src: np.ndarray, angle: float, scale: float, seed: int) -> np.ndarray:
    region = src[60:240, 60:240]
    M = cv2.getRotationMatrix2D((region.shape[1] / 2, region.shape[0] / 2), angle, scale)
    rot = cv2.warpAffine(region, M, (region.shape[1], region.shape[0]), borderValue=200)
    canvas = (np.random.default_rng(seed).normal(200, 12, (320, 320)).clip(0, 255)).astype(np.uint8)
    canvas[70 : 70 + rot.shape[0], 70 : 70 + rot.shape[1]] = rot
    return cv2.GaussianBlur(canvas, (3, 3), 0)


def clone_within(img: np.ndarray) -> np.ndarray:
    out = img.copy()
    patch = out[40:140, 40:140]
    out[180:280, 180:280] = patch  # paste a copy elsewhere in the same image
    return out


def main() -> int:
    work = Path(tempfile.mkdtemp(prefix="stress_"))
    clean = {f"clean_{i}": blot_panel(i) for i in range(1, 5)}  # 4 unrelated panels

    # Positive (cross-image) cases keyed by the clean panel they derive from.
    positives = {
        "dup_exact": ("clean_1", clean["clean_1"].copy()),
        "dup_jpeg": ("clean_1", clean["clean_1"]),  # written as JPEG below
        "splice_rot30": ("clean_2", splice_region(clean["clean_2"], 30, 1.15, 91)),
        "splice_scaled": ("clean_3", splice_region(clean["clean_3"], 12, 1.4, 92)),
        "splice_flip": ("clean_4", cv2.flip(splice_region(clean["clean_4"], 0, 1.0, 93), 1)),
    }

    for name, img in clean.items():
        cv2.imwrite(str(work / f"{name}.png"), img)
    for name, (_src, img) in positives.items():
        if name == "dup_jpeg":
            cv2.imwrite(str(work / f"{name}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 70])
        else:
            cv2.imwrite(str(work / f"{name}.png"), img)

    findings = advanced_detector.scan(work)
    flagged: set[frozenset[str]] = set()
    for f in findings:
        flagged.add(frozenset({Path(f.a).stem, Path(f.b).stem}))

    # Recall: each positive should be flagged against its source clean panel.
    caught, total = 0, len(positives)
    print("== cross-image recall ==")
    for name, (src, _img) in positives.items():
        hit = frozenset({name, src}) in flagged
        caught += hit
        print(f"  {'HIT ' if hit else 'MISS'} {name} <-> {src}")

    # False positives: unrelated clean panels flagged against each other.
    clean_names = list(clean.keys())
    fp = 0
    clean_pairs = 0
    for i in range(len(clean_names)):
        for j in range(i + 1, len(clean_names)):
            clean_pairs += 1
            if frozenset({clean_names[i], clean_names[j]}) in flagged:
                fp += 1
    recall = caught / total
    fpr = fp / clean_pairs if clean_pairs else 0.0
    print(f"\nrecall={recall:.0%} ({caught}/{total})   false-positive rate={fpr:.0%} ({fp}/{clean_pairs})")

    # Intra-image copy-move: cloned image should fire, clean should not.
    print("\n== intra-image copy-move ==")
    cloned = clone_within(clean["clean_1"])
    r_clone = forensics.intra_image_copy_move(cloned)
    r_clean = forensics.intra_image_copy_move(clean["clean_2"])
    print(f"  cloned image:  score={r_clone.score:.0f}  ({r_clone.detail})")
    print(f"  clean image:   score={r_clean.score:.0f}  ({r_clean.detail})")

    shutil.rmtree(work, ignore_errors=True)

    ok = recall >= 0.8 and fpr == 0.0 and r_clone.score > 0 and r_clean.score == 0
    print(f"\n{'PASS' if ok else 'CHECK'}: recall>=80% & 0 FP & intra clone>0 & intra clean==0")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
