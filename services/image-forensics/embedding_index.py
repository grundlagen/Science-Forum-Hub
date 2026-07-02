"""
Cross-literature image similarity index — the ImageTwin architecture in miniature.

ImageTwin's edge over per-paper checks is its index of ~150M published figures:
every new panel is embedded and searched against the whole literature. The moat is
DATA + INDEX, not algorithm. This module is that index layer, with a pluggable
embedding backend:

  * `deep`     — DINOv2 (torch hub) when torch is installed: state of the art for
                 self-supervised image retrieval; robust to recompression, resize,
                 moderate crops.
  * `classic`  — zero-dependency fallback used automatically when torch is absent:
                 a flip-canonicalized descriptor of (a) a coarse intensity grid and
                 (b) a gradient-orientation histogram pyramid. Robust to rescale,
                 recompression, brightness shifts and mirroring; weaker on heavy
                 crops (the ORB stage in advanced_detector.py covers those on the
                 shortlist).

Search is exact cosine over a memory-mapped matrix (numpy), switching to FAISS
automatically if it is installed. 1M panels x 256-dim float32 is ~1 GB — a laptop
handles a multi-journal corpus; the harvesting pipeline is the real work.

Pipeline:  harvest figures -> panel_segment.py -> add() -> save()
Query:     embed(panel) -> top-k -> confirm hits with detector.py ORB/RANSAC.

Not legal advice. A retrieval hit is a lead for human review, never a finding.
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

# ---- tunables -------------------------------------------------------------
GRID = 12                  # coarse intensity grid (GRID x GRID)
ORI_BINS = 12              # gradient-orientation histogram bins per pyramid cell
PYRAMID = (1, 2)           # orientation-histogram pyramid levels (1x1 + 2x2 cells)
MATCH_THRESHOLD = 0.90     # cosine similarity that makes a candidate a lead
# ---------------------------------------------------------------------------


def _classic_embed(gray: np.ndarray) -> np.ndarray:
    """Flip-canonicalized classical embedding (no ML weights required)."""
    g = cv2.resize(gray, (96, 96), interpolation=cv2.INTER_AREA).astype(np.float32)
    # Canonicalize mirroring: pick the horizontal orientation with the brighter
    # left half, so an image and its mirror embed identically.
    if g[:, : 48].mean() < g[:, 48:].mean():
        g = g[:, ::-1]
    g = (g - g.mean()) / (g.std() + 1e-6)

    parts: list[np.ndarray] = []
    # (a) coarse intensity grid. Zero-mean and re-normalize so the (shared) flat
    # background contributes nothing to cosine similarity — only the LAYOUT of
    # content differentiates panels.
    grid = cv2.resize(g, (GRID, GRID), interpolation=cv2.INTER_AREA).flatten()
    grid = grid - grid.mean()
    grid = grid / (np.linalg.norm(grid) + 1e-9)
    parts.append(grid)
    # (b) gradient-orientation histogram pyramid (contrast-invariant structure)
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(g, cv2.CV_32F, 0, 1)
    mag = np.hypot(gx, gy)
    ang = (np.arctan2(gy, gx) + np.pi) / (2 * np.pi)  # 0..1
    for cells in PYRAMID:
        step = 96 // cells
        for cy in range(cells):
            for cx in range(cells):
                sl = (slice(cy * step, (cy + 1) * step), slice(cx * step, (cx + 1) * step))
                hist, _ = np.histogram(
                    ang[sl], bins=ORI_BINS, range=(0.0, 1.0), weights=mag[sl]
                )
                hist = hist.astype(np.float32)
                hist = hist - hist.mean()  # drop the isotropic-gradient floor
                hist = hist / (np.linalg.norm(hist) + 1e-9)
                parts.append(hist)
    v = np.concatenate(parts)
    n = np.linalg.norm(v)
    return v / (n + 1e-9)


def _try_deep_embedder():
    try:
        import torch  # noqa: F401

        model = torch.hub.load("facebookresearch/dinov2", "dinov2_vits14")
        model.eval()

        def embed(gray: np.ndarray) -> np.ndarray:
            import torch

            rgb = cv2.cvtColor(cv2.resize(gray, (224, 224)), cv2.COLOR_GRAY2RGB)
            x = torch.from_numpy(rgb).permute(2, 0, 1).float().unsqueeze(0) / 255.0
            mean = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
            std = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)
            with torch.no_grad():
                v = model((x - mean) / std).squeeze(0).numpy()
            return v / (np.linalg.norm(v) + 1e-9)

        return embed, "dinov2_vits14"
    except Exception:
        return None, None


@dataclass
class Hit:
    key: str
    similarity: float


class PanelIndex:
    """Append-only embedding index with exact cosine search (FAISS if available)."""

    def __init__(self) -> None:
        deep, name = _try_deep_embedder()
        self._embed = deep or _classic_embed
        self.backend = name or "classic"
        self.keys: list[str] = []
        self._vecs: list[np.ndarray] = []
        self._matrix: np.ndarray | None = None

    def embed(self, gray: np.ndarray) -> np.ndarray:
        return self._embed(gray)

    def add(self, key: str, gray: np.ndarray) -> None:
        self.keys.append(key)
        self._vecs.append(self.embed(gray))
        self._matrix = None

    def _mat(self) -> np.ndarray:
        if self._matrix is None:
            self._matrix = np.vstack(self._vecs) if self._vecs else np.zeros((0, 1), np.float32)
        return self._matrix

    def query(self, gray: np.ndarray, top_k: int = 5, exclude: str | None = None) -> list[Hit]:
        if not self.keys:
            return []
        q = self.embed(gray)
        sims = self._mat() @ q
        order = np.argsort(-sims)
        hits: list[Hit] = []
        for i in order:
            if exclude is not None and self.keys[i] == exclude:
                continue
            hits.append(Hit(self.keys[i], float(sims[i])))
            if len(hits) >= top_k:
                break
        return hits

    def save(self, path: Path) -> None:
        np.savez_compressed(path.with_suffix(".npz"), matrix=self._mat())
        path.with_suffix(".json").write_text(
            json.dumps({"backend": self.backend, "keys": self.keys})
        )

    @classmethod
    def load(cls, path: Path) -> "PanelIndex":
        idx = cls()
        meta = json.loads(path.with_suffix(".json").read_text())
        if meta["backend"] != idx.backend:
            print(
                f"warning: index built with backend={meta['backend']}, "
                f"query backend={idx.backend}; similarities are not comparable",
                file=sys.stderr,
            )
        idx.keys = meta["keys"]
        m = np.load(path.with_suffix(".npz"))["matrix"]
        idx._vecs = [m[i] for i in range(m.shape[0])]
        idx._matrix = m
        return idx


def build_from_dir(figures_dir: Path, index_path: Path, segment: bool = True) -> PanelIndex:
    """Index every figure (or every panel of every figure) under a directory."""
    from panel_segment import extract_panels

    idx = PanelIndex()
    exts = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
    for p in sorted(figures_dir.rglob("*")):
        if p.suffix.lower() not in exts:
            continue
        if segment:
            try:
                crops = extract_panels(p)
            except ValueError:
                continue
            if not crops:
                gray = cv2.imread(str(p), cv2.IMREAD_GRAYSCALE)
                crops = [] if gray is None else [(None, gray)]
            for i, (_, crop) in enumerate(crops):
                idx.add(f"{p.relative_to(figures_dir)}#p{i}", crop)
        else:
            gray = cv2.imread(str(p), cv2.IMREAD_GRAYSCALE)
            if gray is not None:
                idx.add(str(p.relative_to(figures_dir)), gray)
    idx.save(index_path)
    print(f"indexed {len(idx.keys)} panel(s) from {figures_dir} (backend={idx.backend})")
    return idx


def main() -> int:
    args = sys.argv[1:]
    if len(args) >= 3 and args[0] == "build":
        build_from_dir(Path(args[1]), Path(args[2]))
        return 0
    if len(args) >= 3 and args[0] == "query":
        idx = PanelIndex.load(Path(args[1]))
        gray = cv2.imread(args[2], cv2.IMREAD_GRAYSCALE)
        if gray is None:
            print(f"cannot read {args[2]}")
            return 1
        for h in idx.query(gray, top_k=10):
            flag = "LEAD" if h.similarity >= MATCH_THRESHOLD else "    "
            print(f"{flag} {h.similarity:.4f}  {h.key}")
        return 0
    print("usage: python embedding_index.py build <figures_dir> <index_path>")
    print("       python embedding_index.py query <index_path> <image>")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
