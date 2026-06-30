"""
Generate a synthetic figure set with two PLANTED manipulations, then run the
detector. Demonstrates the algorithm catches what a sleuth looks for:

  panel_a/b/c       : three distinct, unrelated "blot-like" panels
  dup_of_a          : an exact reuse of panel_a (whole-panel duplication)
  spliced_from_b    : a NEW noise panel with a region of panel_b rotated 30deg,
                      scaled and pasted in (region reuse, manipulation-invariant)

Expected: pHash flags (panel_a, dup_of_a); ORB+RANSAC flags (panel_b, spliced_from_b).
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

rng = np.random.default_rng(42)
OUT = Path(__file__).parent / "synthetic_panels"
OUT.mkdir(exist_ok=True)


def blot_panel(seed: int, size: int = 320) -> np.ndarray:
    r = np.random.default_rng(seed)
    img = (r.normal(200, 12, (size, size)).clip(0, 255)).astype(np.uint8)  # noisy bg
    for _ in range(6):  # a few dark "bands"/blobs
        x, y = r.integers(40, size - 80, 2)
        w, h = r.integers(30, 90, 2)
        cv2.ellipse(img, (int(x), int(y)), (int(w), int(h)), float(r.integers(0, 180)),
                    0, 360, int(r.integers(20, 90)), -1)
    # high-contrast texture (specks + thin lines) so there are stable ORB keypoints,
    # like the speckle/edges in a real gel/blot/microscopy panel.
    for _ in range(220):
        x, y = r.integers(0, size, 2)
        cv2.circle(img, (int(x), int(y)), int(r.integers(1, 3)), int(r.integers(0, 60)), -1)
    for _ in range(12):
        x1, y1, x2, y2 = r.integers(0, size, 4)
        cv2.line(img, (int(x1), int(y1)), (int(x2), int(y2)), int(r.integers(0, 80)), 1)
    return cv2.GaussianBlur(img, (3, 3), 0)


def save(name: str, img: np.ndarray) -> None:
    cv2.imwrite(str(OUT / f"{name}.png"), img)


def main() -> None:
    a, b, c = blot_panel(1), blot_panel(2), blot_panel(3)
    save("panel_a", a)
    save("panel_b", b)
    save("panel_c", c)

    # Manipulation 1: whole-panel duplication (with mild jpeg-like blur).
    save("dup_of_a", cv2.GaussianBlur(a, (3, 3), 0))

    # Manipulation 2: take a region of panel_b, rotate+scale, splice into new noise.
    region = b[60:220, 60:220]
    M = cv2.getRotationMatrix2D((region.shape[1] / 2, region.shape[0] / 2), 30, 1.15)
    region_rot = cv2.warpAffine(region, M, (region.shape[1], region.shape[0]), borderValue=200)
    canvas = (np.random.default_rng(99).normal(200, 12, (320, 320)).clip(0, 255)).astype(np.uint8)
    canvas[80:80 + region_rot.shape[0], 80:80 + region_rot.shape[1]] = region_rot
    save("spliced_from_b", cv2.GaussianBlur(canvas, (3, 3), 0))

    print(f"Wrote synthetic panels to {OUT}\n")

    import detector
    findings = detector.scan(OUT)
    if not findings:
        print("No signals (unexpected).")
        return
    print(f"{len(findings)} duplication signal(s):\n")
    for f in findings:
        print(f"  {f}")


if __name__ == "__main__":
    main()
