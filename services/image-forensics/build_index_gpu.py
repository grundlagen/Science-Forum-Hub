"""
GPU batch index builder — same `PanelIndex` output format, but embeds in batches
on CUDA. Used for large corpora on rented GPUs (e.g. vast.ai RTX 4090).

The default `embedding_index.PanelIndex` embeds one image at a time on CPU; that
is fine for hundreds of panels but wastes a rented GPU on thousands. This script
loads DINOv2 once to CUDA, iterates the harvested corpus, batches panels, and
writes an index file readable by `PanelIndex.load()`.

    python build_index_gpu.py <figures_dir> <index_path> [--batch 64] [--no-segment]

Not legal advice. A retrieval hit is a lead for human review, never a finding.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("figures_dir", type=Path)
    ap.add_argument("index_path", type=Path)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--no-segment", action="store_true")
    args = ap.parse_args()

    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device={device} torch={torch.__version__}", flush=True)
    model = torch.hub.load("facebookresearch/dinov2", "dinov2_vits14").to(device).eval()
    mean = torch.tensor([0.485, 0.456, 0.406], device=device).view(1, 3, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225], device=device).view(1, 3, 1, 1)

    exts = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
    files = [p for p in sorted(args.figures_dir.rglob("*")) if p.suffix.lower() in exts]
    print(f"found {len(files)} figure files under {args.figures_dir}", flush=True)

    if args.no_segment:
        segmenter = None
    else:
        sys.path.insert(0, str(Path(__file__).parent))
        from panel_segment import extract_panels
        segmenter = extract_panels

    keys: list[str] = []
    vectors: list[np.ndarray] = []

    def panel_iter():
        for p in files:
            crops = None
            if segmenter is not None:
                try:
                    crops = segmenter(p)
                except Exception:
                    crops = None
            if not crops:
                g = cv2.imread(str(p), cv2.IMREAD_GRAYSCALE)
                if g is not None:
                    yield f"{p.relative_to(args.figures_dir)}", g
                continue
            for i, c in enumerate(crops):
                yield f"{p.relative_to(args.figures_dir)}#panel{i}", c

    batch_keys: list[str] = []
    batch_tensors: list[torch.Tensor] = []

    def flush():
        if not batch_tensors:
            return
        x = torch.stack(batch_tensors).to(device)
        x = (x - mean) / std
        with torch.no_grad():
            v = model(x).cpu().numpy()
        v = v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
        for k, row in zip(batch_keys, v):
            keys.append(k)
            vectors.append(row)
        batch_keys.clear()
        batch_tensors.clear()

    t0 = time.time()
    n_seen = 0
    for key, gray in panel_iter():
        rgb = cv2.cvtColor(cv2.resize(gray, (224, 224)), cv2.COLOR_GRAY2RGB)
        t = torch.from_numpy(rgb).permute(2, 0, 1).float() / 255.0
        batch_keys.append(key)
        batch_tensors.append(t)
        n_seen += 1
        if len(batch_tensors) >= args.batch:
            flush()
            if n_seen % (args.batch * 20) == 0:
                rate = n_seen / max(1e-3, time.time() - t0)
                print(f"embedded {n_seen} panels ({rate:.1f}/s)", flush=True)
    flush()

    if not vectors:
        print("no panels indexed", flush=True)
        return 1

    matrix = np.vstack(vectors).astype(np.float32)
    args.index_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.index_path.with_suffix(".npz"), matrix=matrix)
    args.index_path.with_suffix(".json").write_text(
        json.dumps({"backend": f"dinov2_vits14/{device}", "keys": keys})
    )
    dt = time.time() - t0
    print(
        json.dumps(
            {
                "device": device,
                "panels": len(keys),
                "dim": int(matrix.shape[1]),
                "seconds": round(dt, 1),
                "index": str(args.index_path),
            },
            indent=2,
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
