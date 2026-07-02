"""
Figure panel segmentation: split a multi-panel scientific figure into its panels.

ImageTwin-class systems compare PANELS, not whole figures — a duplicated western
blot is one panel inside a 6-panel figure, and whole-figure hashes dilute it below
threshold. Method (classical, no ML weights needed):

  1. binarize on "non-background" (background = dominant border color, usually
     white) with a tolerance;
  2. recursively cut along full-width/full-height background gutters
     (projection-profile cuts, the standard document-layout technique);
  3. emit leaf rectangles above a minimum size as panels.

Output panels feed detector.py / advanced_detector.py / embedding_index.py.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

# ---- tunables -------------------------------------------------------------
BG_TOLERANCE = 24          # |pixel - background| <= this counts as background
GUTTER_MIN_FRAC = 0.995    # a row/col this empty (fraction background) is a gutter
MIN_GUTTER_PX = 4          # gutter must be at least this thick to cut
MIN_PANEL_PX = 48          # ignore leaves smaller than this on either side
MAX_DEPTH = 4              # recursion depth (panels-of-panels)
# ---------------------------------------------------------------------------


@dataclass
class Panel:
    x: int
    y: int
    w: int
    h: int


def _background_value(gray: np.ndarray) -> int:
    """Estimate the background gray level from the image border pixels."""
    border = np.concatenate([gray[0, :], gray[-1, :], gray[:, 0], gray[:, -1]])
    return int(np.median(border))


def _gutter_runs(empty: np.ndarray) -> list[tuple[int, int]]:
    """Runs of consecutive True (empty) indices, as (start, length)."""
    runs: list[tuple[int, int]] = []
    start = None
    for i, e in enumerate(empty):
        if e and start is None:
            start = i
        elif not e and start is not None:
            runs.append((start, i - start))
            start = None
    if start is not None:
        runs.append((start, len(empty) - start))
    return runs


def _split(mask: np.ndarray, x: int, y: int, w: int, h: int, depth: int, out: list[Panel]) -> None:
    """Recursively cut region (x,y,w,h) of the foreground mask along gutters."""
    sub = mask[y : y + h, x : x + w]
    # Trim background margins first so gutters at the edges don't spawn empty leaves.
    rows = sub.mean(axis=1)
    cols = sub.mean(axis=0)
    nz_r = np.where(rows > 1 - GUTTER_MIN_FRAC)[0]
    nz_c = np.where(cols > 1 - GUTTER_MIN_FRAC)[0]
    if len(nz_r) == 0 or len(nz_c) == 0:
        return
    y0, y1 = int(nz_r[0]), int(nz_r[-1]) + 1
    x0, x1 = int(nz_c[0]), int(nz_c[-1]) + 1
    x, y, w, h = x + x0, y + y0, x1 - x0, y1 - y0
    if w < MIN_PANEL_PX or h < MIN_PANEL_PX:
        return
    sub = mask[y : y + h, x : x + w]

    if depth < MAX_DEPTH:
        for axis in (0, 1):  # 0 = cut along rows (horizontal gutters), 1 = columns
            profile = sub.mean(axis=1 - axis)
            empty = profile <= (1 - GUTTER_MIN_FRAC)
            runs = [(s, l) for s, l in _gutter_runs(empty) if l >= MIN_GUTTER_PX]
            # Interior gutters only.
            runs = [(s, l) for s, l in runs if s > 0 and s + l < len(empty)]
            if runs:
                cuts = [0] + [s + l // 2 for s, l in runs] + [len(empty)]
                pieces = [(cuts[i], cuts[i + 1] - cuts[i]) for i in range(len(cuts) - 1)]
                if len(pieces) > 1:
                    for off, size in pieces:
                        if axis == 0:
                            _split(mask, x, y + off, w, size, depth + 1, out)
                        else:
                            _split(mask, x + off, y, size, h, depth + 1, out)
                    return
    out.append(Panel(x, y, w, h))


def segment_panels(gray: np.ndarray) -> list[Panel]:
    """Split a grayscale figure into panel bounding boxes."""
    bg = _background_value(gray)
    mask = (np.abs(gray.astype(np.int16) - bg) > BG_TOLERANCE).astype(np.float32)
    out: list[Panel] = []
    _split(mask, 0, 0, gray.shape[1], gray.shape[0], 0, out)
    return out


def extract_panels(image_path: Path, out_dir: Path | None = None) -> list[tuple[Panel, np.ndarray]]:
    """Segment a figure file; optionally write each panel as PNG for inspection."""
    gray = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if gray is None:
        raise ValueError(f"cannot read {image_path}")
    panels = segment_panels(gray)
    crops = [(p, gray[p.y : p.y + p.h, p.x : p.x + p.w]) for p in panels]
    if out_dir is not None:
        out_dir.mkdir(parents=True, exist_ok=True)
        for i, (p, crop) in enumerate(crops):
            cv2.imwrite(str(out_dir / f"{image_path.stem}_panel{i:02d}.png"), crop)
    return crops


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python panel_segment.py <figure.png> [out_dir]")
        return 1
    path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    crops = extract_panels(path, out_dir)
    print(f"{path.name}: {len(crops)} panel(s)")
    for p, _ in crops:
        print(f"  panel at x={p.x} y={p.y} w={p.w} h={p.h}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
