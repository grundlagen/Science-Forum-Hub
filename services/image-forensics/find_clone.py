#!/usr/bin/env python3
"""Run Sholto David block-matching clone detection on ALL 32 panels, rank by evidence."""
import sys, cv2, numpy as np
from pathlib import Path

_here = Path(__file__).resolve().parent
sys.path.insert(0, str(_here))
from panel_segment import extract_panels

CORPUS = Path(__file__).resolve().parent.parent / "data" / "test_figures" / "dana_farber"

def sholto_david_detect(panel, block_size=16, min_corr=0.98, min_sep=20):
    """Block-matching: find near-identical regions separated in space."""
    h, w = panel.shape
    if panel.std() < 3:
        return []
    blocks = {}
    step = max(2, block_size // 2)
    for y in range(0, h - block_size, step):
        for x in range(0, w - block_size, step):
            block = panel[y:y+block_size, x:x+block_size].astype(np.float32)
            if block.std() < 4:
                continue
            blocks[(x, y)] = block
    clones = []
    keys = list(blocks.keys())
    # Compare only a sample to keep it fast
    for i in range(0, len(keys), 2):
        for j in range(i + 1, min(i + 500, len(keys))):
            a = blocks[keys[i]]; b = blocks[keys[j]]
            an = (a - a.mean()) / (a.std() + 1e-9)
            bn = (b - b.mean()) / (b.std() + 1e-9)
            corr = float(np.mean(an * bn))
            if corr > min_corr:
                dx, dy = abs(keys[i][0] - keys[j][0]), abs(keys[i][1] - keys[j][1])
                if dx > min_sep or dy > min_sep:
                    clones.append((keys[i], keys[j], corr))
    return sorted(clones, key=lambda x: -x[2])

print("Running Sholto David block-matching on all panels...")
results = []
for fp in sorted(CORPUS.glob("*.jpg")):
    crops = extract_panels(fp)
    if not crops:
        continue
    for i, item in enumerate(crops):
        if isinstance(item, tuple):
            _, panel = item
        else:
            panel = item
        if panel is None or min(panel.shape) < 30:
            continue
        clones = sholto_david_detect(panel)
        if clones:
            top = clones[0]
            results.append((f"{fp.name}#panel{i}", len(clones), top[2], top[0], top[1], panel.shape))

results.sort(key=lambda x: -x[2])
print(f"\nFound {len(results)} panels with clone candidates:\n")
for i, (name, n_clones, corr, pos_a, pos_b, shape) in enumerate(results[:15], 1):
    dx = abs(pos_a[0] - pos_b[0])
    dy = abs(pos_a[1] - pos_b[1])
    print(f"{i:2d}. {name:35s}  clones={n_clones}  top_corr={corr:.4f}  offset=({dx},{dy})  size={shape[0]}x{shape[1]}")
