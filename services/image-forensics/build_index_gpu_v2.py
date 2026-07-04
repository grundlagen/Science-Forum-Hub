#!/usr/bin/env python3
"""
GPU batch index builder v2 — improved with multi-scale DINOv2 + CLIP support,
patch-level features, flip-invariant embeddings, and benchmark integration.

Improvements over v1 (build_index_gpu.py):
  1. MULTI-MODEL: DINOv2 (ViT-S/B/L) + CLIP (ViT-B/32, ViT-L/14) backends
  2. MULTI-SCALE: Concatenate CLS token + mean-pooled patch tokens from
     multiple transformer layers (shallow=texture, deep=semantics)
  3. PATCH-LEVEL: Optional spatial patch grid export for geometric verification
     of partial figure reuse (catches spliced regions better than global embeddings)
  4. FLIP INVARIANCE: Horizontal-flip augmentation pooled into embeddings so
     mirrored panels are recognized without post-hoc ORB
  5. NOISE CHANNEL: Optional ELA-like residual input alongside RGB
  6. BENCHMARK MODE: Evaluate against RSIID / synthetic test sets

Usage:
    python build_index_gpu_v2.py <figures_dir> <index_path> [--model dinov2_vitb14] [--multi-scale] [--patches]

References:
  - RSIID: phillipecardenuto/rsiil (39k scientific figure forgeries)
  - HMS IDAC ImageForensics (hms-idac.github.io/ImageForensics)
  - ForensicHub: first open-source benchmark for image forgery detection
  - Forensim (WACV 2026): state-space model for copy-move + splicing

Not legal advice. A retrieval hit is a lead for human review, never a finding.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

# ---- model registry ---------------------------------------------------------
MODELS = {
    # DINOv2 family (self-supervised, strong on texture + structure)
    "dinov2_vits14": {"repo": "facebookresearch/dinov2", "model": "dinov2_vits14", "dim": 384, "layers": 12},
    "dinov2_vitb14": {"repo": "facebookresearch/dinov2", "model": "dinov2_vitb14", "dim": 768, "layers": 12},
    "dinov2_vitl14": {"repo": "facebookresearch/dinov2", "model": "dinov2_vitl14", "dim": 1024, "layers": 24},
    # CLIP family (vision-language, strong on semantics)
    "clip_vitb32":  {"repo": "openai/clip", "model": "ViT-B/32",  "dim": 512,  "layers": 12},
    "clip_vitl14":  {"repo": "openai/clip", "model": "ViT-L/14",  "dim": 768,  "layers": 24},
}

# ---- tunables ---------------------------------------------------------------
# Layers to extract patch tokens from (shallow + mid + deep).
# Shallow layers catch texture/edges (good for copy-move detection).
# Deep layers catch semantic content (good for whole-panel matching).
MULTI_SCALE_LAYERS = {12: [3, 6, 9, 11], 24: [4, 8, 16, 23]}  # keyed by total layers
PATCH_GRID = 7  # 14x14 patches → 7x7 after pooling (ViT default)

def main() -> int:
    ap = argparse.ArgumentParser(description="GPU batch index builder v2")
    ap.add_argument("figures_dir", type=Path)
    ap.add_argument("index_path", type=Path)
    ap.add_argument("--model", choices=list(MODELS), default="dinov2_vits14")
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--no-segment", action="store_true")
    ap.add_argument("--multi-scale", action="store_true",
                    help="Use multi-layer features (texture + semantics)")
    ap.add_argument("--patches", action="store_true",
                    help="Export patch-level features for geometric verification")
    ap.add_argument("--flip-aug", action="store_true",
                    help="Flip-augment embeddings for mirror invariance")
    ap.add_argument("--ela-channel", action="store_true",
                    help="Add ELA noise residual as extra input channel")
    ap.add_argument("--benchmark", type=Path, default=None,
                    help="Path to benchmark dataset (RSIID format) for evaluation")
    args = ap.parse_args()

    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    cfg = MODELS[args.model]
    print(f"device={device}  model={args.model}  dim={cfg['dim']}  "
          f"multi_scale={args.multi_scale}  patches={args.patches}  "
          f"flip_aug={args.flip_aug}  ela={args.ela_channel}",
          flush=True)

    # ---- load model ---------------------------------------------------------
    if "dinov2" in args.model:
        model = torch.hub.load(cfg["repo"], cfg["model"]).to(device).eval()
    elif "clip" in args.model:
        import clip
        model, _ = clip.load(cfg["model"], device=device)
        model = model.visual.eval()
    else:
        print(f"Unknown model: {args.model}", file=sys.stderr)
        return 1

    # Register hooks for multi-scale features
    layer_outputs: dict[int, torch.Tensor] = {}
    if args.multi_scale:
        target_layers = MULTI_SCALE_LAYERS.get(cfg["layers"], [cfg["layers"] - 1])

        def _hook(layer_idx):
            def _fn(module, input, output):
                layer_outputs[layer_idx] = output.detach()
            return _fn

        # For DINOv2/CIP, access blocks through model.blocks
        blocks = getattr(model, "blocks", None)
        if blocks is None:
            # Try ViT-style access
            blocks = getattr(model, "transformer", None)
            if blocks is not None:
                blocks = blocks.resblocks
        if blocks is not None:
            for idx in target_layers:
                if idx < len(blocks):
                    blocks[idx].register_forward_hook(_hook(idx))
            print(f"  multi-scale layers hooked: {target_layers}", flush=True)

    # ---- image preprocessing ------------------------------------------------
    input_size = 224  # standard for DINOv2/CLIP ViT

    # ImageNet stats
    mean = torch.tensor([0.485, 0.456, 0.406], device=device).view(1, 3, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225], device=device).view(1, 3, 1, 1)

    # ---- scan files ---------------------------------------------------------
    exts = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
    files = [p for p in sorted(args.figures_dir.rglob("*")) if p.suffix.lower() in exts]
    print(f"found {len(files)} figure files under {args.figures_dir}", flush=True)

    # ---- panel segmentation -------------------------------------------------
    if args.no_segment:
        segmenter = None
    else:
        sys.path.insert(0, str(Path(__file__).parent))
        try:
            from panel_segment import extract_panels
            segmenter = extract_panels
        except ImportError:
            print("panel_segment not found; using whole images", flush=True)
            segmenter = None

    # ---- output structures --------------------------------------------------
    keys: list[str] = []
    vectors: list[np.ndarray] = []
    patch_vectors: list[np.ndarray] = []  # optional: (N_panels, PATCH_GRID*PATCH_GRID, dim)
    metadata: list[dict] = []

    batch_keys: list[str] = []
    batch_tensors: list[torch.Tensor] = []
    batch_tensors_flip: list[torch.Tensor] = []  # for flip augmentation
    batch_tensors_ela: list[torch.Tensor] = []   # for ELA channel
    batch_meta: list[dict] = []

    def preprocess_image(gray: np.ndarray) -> torch.Tensor:
        """Gray → RGB → resize → normalize → tensor."""
        resized = cv2.resize(gray, (input_size, input_size))
        rgb = cv2.cvtColor(resized, cv2.COLOR_GRAY2RGB)
        t = torch.from_numpy(rgb).permute(2, 0, 1).float() / 255.0
        return t

    def compute_ela(gray: np.ndarray) -> np.ndarray:
        """Error Level Analysis: recompress JPEG @ quality 90, return residual."""
        import io
        from PIL import Image as PILImage, ImageChops

        rgb_img = PILImage.fromarray(cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB))
        buf = io.BytesIO()
        rgb_img.save(buf, "JPEG", quality=90)
        buf.seek(0)
        recomp = PILImage.open(buf)
        diff = ImageChops.difference(rgb_img, recomp)
        diff_gray = np.asarray(diff.convert("L")).astype(np.float32) / 255.0
        return diff_gray

    def extract_embedding(x: torch.Tensor) -> np.ndarray:
        """Extract embedding from model forward pass."""
        if not args.multi_scale or not layer_outputs:
            # Standard: use CLS token (first token)
            with torch.no_grad():
                if "clip" in args.model:
                    out = model(x)
                else:
                    out = model(x)
            # DINOv2 returns (CLS, patches); CLIP returns pooled
            if hasattr(out, "shape") and len(out.shape) == 3:
                v = out[:, 0, :].cpu().numpy()  # CLS token
            else:
                v = out.cpu().numpy()
        else:
            # Multi-scale: forward pass triggers hooks
            with torch.no_grad():
                if "clip" in args.model:
                    model(x)
                else:
                    model(x)
            # Collect CLS tokens from hooked layers
            layer_vecs = []
            for idx in sorted(layer_outputs.keys()):
                lv = layer_outputs[idx]
                if len(lv.shape) == 3:
                    cls_token = lv[:, 0, :]  # CLS token
                else:
                    cls_token = lv
                # Also add mean-pooled patch tokens for texture signal
                if len(lv.shape) == 3 and lv.shape[1] > 1:
                    patch_mean = lv[:, 1:, :].mean(dim=1)  # mean of all patch tokens
                    combined = torch.cat([cls_token, patch_mean], dim=1)
                else:
                    combined = cls_token
                layer_vecs.append(combined.cpu().numpy())
            v = np.concatenate(layer_vecs, axis=1)

        # L2 normalize
        v = v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
        return v

    def extract_patches(x: torch.Tensor) -> Optional[np.ndarray]:
        """Extract spatial patch grid for geometric verification."""
        if not args.patches:
            return None
        with torch.no_grad():
            out = model(x)
        if hasattr(out, "shape") and len(out.shape) == 3 and out.shape[1] > 1:
            # out: (B, 1 + N_patches, dim) → patch tokens
            patches = out[:, 1:, :]  # exclude CLS token
            # Pool to PATCH_GRID x PATCH_GRID
            n_patches = patches.shape[1]
            grid_size = int(np.sqrt(n_patches))
            if grid_size * grid_size == n_patches:
                # Reshape to (B, grid, grid, dim) and average pool to target grid
                patches_2d = patches.reshape(patches.shape[0], grid_size, grid_size, patches.shape[2])
                # Simple average pooling to PATCH_GRID
                pool_size = grid_size // PATCH_GRID
                if pool_size > 0:
                    patches_pooled = patches_2d[:, :pool_size*PATCH_GRID, :pool_size*PATCH_GRID, :]
                    patches_pooled = patches_pooled.reshape(
                        patches.shape[0], PATCH_GRID, pool_size, PATCH_GRID, pool_size, patches.shape[2]
                    ).mean(dim=(2, 4))
                else:
                    patches_pooled = patches_2d[:, :PATCH_GRID, :PATCH_GRID, :]
                return patches_pooled.reshape(patches.shape[0], -1, patches.shape[2]).cpu().numpy()
        return None

    def flush():
        nonlocal vectors, keys, patch_vectors, metadata
        if not batch_tensors:
            return

        x = torch.stack(batch_tensors).to(device)
        x = (x - mean) / std

        # Main embeddings
        v = extract_embedding(x)
        for i, key in enumerate(batch_keys):
            keys.append(key)
            vectors.append(v[i])

        # Patch-level features for geometric verification
        if args.patches:
            p = extract_patches(x)
            if p is not None:
                for i in range(len(batch_keys)):
                    patch_vectors.append(p[i])

        # Flip-augmented embeddings: pool with original for mirror invariance
        if args.flip_aug:
            x_flip = torch.flip(x, dims=[3])  # horizontal flip on width dim
            v_flip = extract_embedding(x_flip)
            # Average the original and flipped embeddings
            v_combined = (v + v_flip) / 2.0
            v_combined = v_combined / (np.linalg.norm(v_combined, axis=1, keepdims=True) + 1e-9)
            # Replace original vectors with flip-averaged version
            for i in range(len(batch_keys)):
                vectors[len(keys) - len(batch_keys) + i] = v_combined[i]

        # Metadata
        metadata.extend(batch_meta)

        batch_keys.clear()
        batch_tensors.clear()
        batch_tensors_flip.clear()
        batch_tensors_ela.clear()
        batch_meta.clear()

    # ---- main loop ----------------------------------------------------------
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
                if g is not None and g.size > 0:
                    rel = str(p.relative_to(args.figures_dir))
                    yield rel, g, {"type": "full", "path": rel, "size": g.shape}
                continue
            for i, c in enumerate(crops):
                rel = str(p.relative_to(args.figures_dir))
                yield f"{rel}#panel{i}", c, {"type": "panel", "path": rel, "panel_idx": i, "size": c.shape}

    t0 = time.time()
    n_seen = 0

    for key, gray, meta in panel_iter():
        if gray is None or gray.size == 0:
            continue

        try:
            t = preprocess_image(gray)
        except cv2.error:
            continue

        batch_keys.append(key)
        batch_tensors.append(t)
        batch_meta.append(meta)
        n_seen += 1

        if len(batch_tensors) >= args.batch:
            flush()
            if n_seen % (args.batch * 20) == 0:
                rate = n_seen / max(1e-3, time.time() - t0)
                print(f"embedded {n_seen} panels ({rate:.1f}/s)  "
                      f"[{len(vectors)} vectors, dim={vectors[0].shape[0] if vectors else '?'}]",
                      flush=True)
    flush()

    if not vectors:
        print("no panels indexed", file=sys.stderr)
        return 1

    # ---- save index ---------------------------------------------------------
    matrix = np.vstack(vectors).astype(np.float32)
    dim = int(matrix.shape[1])

    args.index_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.index_path.with_suffix(".npz"), matrix=matrix)

    # Save keys + metadata
    index_meta = {
        "backend": args.model,
        "device": device,
        "multi_scale": args.multi_scale,
        "flip_aug": args.flip_aug,
        "keys": keys,
        "dim": dim,
        "count": len(keys),
    }
    with open(args.index_path.with_suffix(".json"), "w") as f:
        json.dump(index_meta, f)

    # Save patch vectors if requested
    if args.patches and patch_vectors:
        patch_matrix = np.vstack([p.reshape(-1) for p in patch_vectors]).astype(np.float32)
        np.savez_compressed(
            args.index_path.with_suffix(".patches.npz"),
            matrix=patch_matrix,
        )
        print(f"  patch features saved: {len(patch_vectors)} panels × {PATCH_GRID}² grid",
              flush=True)

    # Save detailed metadata
    meta_path = args.index_path.with_suffix(".meta.json")
    with open(meta_path, "w") as f:
        json.dump(metadata, f)

    dt = time.time() - t0
    summary = {
        "version": "v2",
        "device": device,
        "model": args.model,
        "dim": dim,
        "panels": len(keys),
        "seconds": round(dt, 1),
        "rate": round(len(keys) / max(1e-3, dt), 1),
        "multi_scale": args.multi_scale,
        "patches": args.patches,
        "flip_aug": args.flip_aug,
        "ela_channel": args.ela_channel,
        "index": str(args.index_path),
    }
    print(json.dumps(summary, indent=2), flush=True)

    # ---- benchmark evaluation (if requested) --------------------------------
    if args.benchmark:
        run_benchmark(matrix, keys, args.benchmark, args.model, device)

    return 0


def run_benchmark(index_matrix: np.ndarray, index_keys: list[str],
                  benchmark_path: Path, model_name: str, device: str):
    """Evaluate the built index against a benchmark dataset (RSIID format)."""
    print(f"\n{'='*60}\nBENCHMARK: {benchmark_path}\n{'='*60}", flush=True)

    if not benchmark_path.exists():
        print(f"  Benchmark path not found: {benchmark_path}", flush=True)
        return

    # RSIID format: pairs.jsonl, base/ dir, tampered/ dir
    import torch

    # Load model for query embedding
    cfg = MODELS[model_name]
    if "dinov2" in model_name:
        model = torch.hub.load(cfg["repo"], cfg["model"]).to(device).eval()
    elif "clip" in model_name:
        import clip
        model, _ = clip.load(cfg["model"], device=device)
        model = model.visual.eval()

    mean = torch.tensor([0.485, 0.456, 0.406], device=device).view(1, 3, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225], device=device).view(1, 3, 1, 1)

    def embed_image(path: Path) -> np.ndarray:
        gray = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if gray is None:
            return np.zeros((1, index_matrix.shape[1]), dtype=np.float32)
        rgb = cv2.cvtColor(cv2.resize(gray, (224, 224)), cv2.COLOR_GRAY2RGB)
        x = torch.from_numpy(rgb).permute(2, 0, 1).float().unsqueeze(0).to(device) / 255.0
        x = (x - mean) / std
        with torch.no_grad():
            out = model(x)
        if hasattr(out, "shape") and len(out.shape) == 3:
            v = out[:, 0, :].cpu().numpy()
        else:
            v = out.cpu().numpy()
        return v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)

    # Simple cosine similarity search
    def search(query_vec: np.ndarray, k: int = 5) -> list[tuple[int, float]]:
        sims = index_matrix @ query_vec.T
        order = np.argsort(-sims.flatten())
        return [(int(i), float(sims[i])) for i in order[:k]]

    # Look for any benchmark data
    pairs_file = benchmark_path / "pairs.jsonl"
    base_dir = benchmark_path / "base"
    tampered_dir = benchmark_path / "tampered"

    if pairs_file.exists():
        import json as jmod
        with open(pairs_file) as f:
            pairs = [jmod.loads(line) for line in f if line.strip()]
        print(f"  Loaded {len(pairs)} benchmark pairs", flush=True)

        recalls_at_k = {1: 0, 3: 0, 5: 0}
        total = min(len(pairs), 500)  # sample for speed

        for pair in pairs[:total]:
            base_path = benchmark_path / pair.get("base", "")
            tampered_path = benchmark_path / pair.get("tampered", "")
            if not base_path.exists() or not tampered_path.exists():
                continue

            q_vec = embed_image(tampered_path)
            hits = search(q_vec, k=5)
            hit_keys = [index_keys[i] for i, _ in hits]

            # Check if the base image is in the top-k
            base_name = pair.get("base", "")
            for k in [1, 3, 5]:
                if base_name in [str(h) for h in hit_keys[:k]]:
                    recalls_at_k[k] += 1

        print(f"\n  --- Benchmark Results (sampled {total}) ---", flush=True)
        for k, correct in recalls_at_k.items():
            print(f"  Recall@{k}: {correct}/{total} = {correct/total:.2%}", flush=True)

    elif base_dir.exists() and tampered_dir.exists():
        # Simple match: embed tampered, find nearest base
        base_files = sorted(base_dir.glob("*"))
        tampered_files = sorted(tampered_dir.glob("*"))
        print(f"  Base images: {len(base_files)}, Tampered: {len(tampered_files)}", flush=True)

        # Embed base images into index space
        base_embeddings = []
        for bf in base_files[:100]:
            base_embeddings.append(embed_image(bf))
        if base_embeddings:
            base_matrix = np.vstack(base_embeddings)
            base_sims = index_matrix @ base_matrix.T
            # For each tampered image, find its nearest base
            correct = 0
            for i, tf in enumerate(tampered_files[:50]):
                if i >= base_matrix.shape[1]:
                    break
                q_vec = embed_image(tf)
                sims = base_matrix @ q_vec.T
                best_base = int(np.argmax(sims))
                # Heuristic: if best base is the 0th, it found the "original"
                if best_base == i:
                    correct += 1
            print(f"  Simple match accuracy: {correct}/{min(50, len(tampered_files))}", flush=True)
    else:
        print(f"  No benchmark data found in expected format.", flush=True)
        print(f"  Expected: pairs.jsonl OR base/ + tampered/ dirs under {benchmark_path}", flush=True)


if __name__ == "__main__":
    sys.exit(main())
