"""
Offline benchmark for panel segmentation + the cross-literature embedding index.
Generates a synthetic figure library, then asserts:

  * segmentation finds the panels of a multi-panel figure;
  * a re-encoded / rescaled / mirrored / brightness-shifted panel retrieves its
    source as the TOP hit above MATCH_THRESHOLD;
  * an unrelated clean panel does NOT cross the threshold (no false lead).

Run:  python index_test.py
"""
from __future__ import annotations

import tempfile
from pathlib import Path

import cv2
import numpy as np

from embedding_index import MATCH_THRESHOLD, PanelIndex
from panel_segment import segment_panels

rng = np.random.default_rng(7)
PASS = 0
FAIL = 0


def check(name: str, cond: bool) -> None:
    global PASS, FAIL
    print(f"{'PASS' if cond else 'FAIL'}  {name}")
    PASS += cond
    FAIL += not cond


def blot(seed: int, w: int = 220, h: int = 160) -> np.ndarray:
    """Synthetic western-blot-like panel: dark bands on a light noisy field."""
    r = np.random.default_rng(seed)
    img = np.full((h, w), 235, np.float32) + r.normal(0, 4, (h, w))
    for _ in range(r.integers(4, 8)):
        y = int(r.integers(15, h - 25))
        x = int(r.integers(10, w - 70))
        bw = int(r.integers(30, 60))
        bh = int(r.integers(6, 14))
        band = np.zeros((bh, bw), np.float32)
        band[bh // 2, :] = 1
        band = cv2.GaussianBlur(band, (0, 0), sigmaX=bw / 6, sigmaY=bh / 4)
        band /= band.max() + 1e-9
        img[y : y + bh, x : x + bw] -= band * float(r.integers(120, 200))
    return np.clip(img, 0, 255).astype(np.uint8)


def figure_of(panels: list[np.ndarray], gap: int = 14) -> np.ndarray:
    """Compose panels horizontally on a white canvas with gutters."""
    h = max(p.shape[0] for p in panels) + 2 * gap
    w = sum(p.shape[1] for p in panels) + gap * (len(panels) + 1)
    canvas = np.full((h, w), 255, np.uint8)
    x = gap
    for p in panels:
        canvas[gap : gap + p.shape[0], x : x + p.shape[1]] = p
        x += p.shape[1] + gap
    return canvas


# ---- 1. panel segmentation ------------------------------------------------
fig = figure_of([blot(1), blot(2), blot(3)])
panels = segment_panels(fig)
check("segmentation finds 3 panels in a 3-panel figure", len(panels) == 3)
check(
    "segmented boxes have sane sizes",
    all(180 <= p.w <= 260 and 120 <= p.h <= 200 for p in panels),
)

# ---- 2. retrieval ----------------------------------------------------------
idx = PanelIndex()
library = {f"paper{i:03d}#p0": blot(100 + i) for i in range(60)}
for key, img in library.items():
    idx.add(key, img)
check("index holds the library", len(idx.keys) == 60)

source_key = "paper007#p0"
src = library[source_key]

# JPEG-recompress + rescale (the normal republication laundering).
ok, enc = cv2.imencode(".jpg", src, [cv2.IMWRITE_JPEG_QUALITY, 70])
recompressed = cv2.imdecode(enc, cv2.IMREAD_GRAYSCALE)
rescaled = cv2.resize(recompressed, (176, 128), interpolation=cv2.INTER_AREA)
hits = idx.query(rescaled, top_k=3)
check("recompressed+rescaled panel: source is top hit", hits[0].key == source_key)
check("recompressed+rescaled panel: above lead threshold", hits[0].similarity >= MATCH_THRESHOLD)

# Mirrored reuse (flip-canonicalization must catch it).
mirrored = src[:, ::-1].copy()
hits_m = idx.query(mirrored, top_k=3)
check("mirrored panel: source is top hit", hits_m[0].key == source_key)
check("mirrored panel: above lead threshold", hits_m[0].similarity >= MATCH_THRESHOLD)

# Brightness/contrast shift.
shifted = np.clip(src.astype(np.float32) * 1.15 - 20, 0, 255).astype(np.uint8)
hits_b = idx.query(shifted, top_k=3)
check("brightness-shifted panel: source is top hit", hits_b[0].key == source_key)

# Unrelated fresh panel must NOT produce a lead.
fresh = blot(9999)
hits_f = idx.query(fresh, top_k=1)
check("unrelated panel stays below lead threshold", hits_f[0].similarity < MATCH_THRESHOLD)

# Exclude-self works (querying a library image for OTHER matches).
hits_x = idx.query(src, top_k=1, exclude=source_key)
check("exclude-self returns a different key", hits_x[0].key != source_key)

# ---- 3. persistence ---------------------------------------------------------
with tempfile.TemporaryDirectory() as td:
    path = Path(td) / "index"
    idx.save(path)
    idx2 = PanelIndex.load(path)
    hits2 = idx2.query(rescaled, top_k=1)
    check("saved+loaded index reproduces the query", hits2[0].key == source_key)

print(f"\n{PASS} passed, {FAIL} failed")
raise SystemExit(1 if FAIL else 0)
