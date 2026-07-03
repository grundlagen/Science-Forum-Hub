"""
GPU batch SPECTER2 embeddings over the fetched OpenAlex JSONL.

SPECTER2 base weights: allenai/specter2_base (Hugging Face, public).
Input format matches SPECTER training: `title + SEP + abstract`.

Usage:
  python embed_abstracts.py <in.jsonl> <out_npz> [--batch 64] [--model allenai/specter2_base]

Emits:
  <out_npz>.npz   — 'vectors' (N x 768 float32), 'ids' (N,) object array of OpenAlex IDs
  <out_npz>.meta.json — model name, dim, count, timing
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np


def iter_records(path: Path):
    with path.open() as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("in_path", type=Path)
    ap.add_argument("out_npz", type=Path)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--model", default="allenai/specter2_base")
    ap.add_argument("--max-len", type=int, default=512)
    args = ap.parse_args()

    import torch
    from transformers import AutoModel, AutoTokenizer

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device={device} model={args.model}", flush=True)
    tok = AutoTokenizer.from_pretrained(args.model)
    model = AutoModel.from_pretrained(args.model).to(device).eval()

    ids: list[str] = []
    all_vecs: list[np.ndarray] = []

    batch_ids: list[str] = []
    batch_txt: list[str] = []

    def flush():
        if not batch_txt:
            return
        enc = tok(
            batch_txt,
            padding=True,
            truncation=True,
            max_length=args.max_len,
            return_tensors="pt",
        ).to(device)
        with torch.no_grad():
            out = model(**enc)
        # SPECTER convention: pooled = last_hidden_state[:, 0, :] (CLS)
        v = out.last_hidden_state[:, 0, :].cpu().numpy()
        v = v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
        ids.extend(batch_ids)
        all_vecs.append(v.astype(np.float32))
        batch_ids.clear()
        batch_txt.clear()

    t0 = time.time()
    n = 0
    for rec in iter_records(args.in_path):
        title = (rec.get("title") or "").strip()
        abstract = (rec.get("abstract") or "").strip()
        if not title and not abstract:
            continue
        text = f"{title}{tok.sep_token}{abstract}" if tok.sep_token else f"{title}. {abstract}"
        batch_ids.append(rec["id"])
        batch_txt.append(text)
        n += 1
        if len(batch_txt) >= args.batch:
            flush()
            if n % (args.batch * 20) == 0:
                rate = n / max(1e-3, time.time() - t0)
                print(f"embedded {n}  ({rate:.1f}/s)", flush=True)
    flush()

    if not all_vecs:
        print("no vectors produced", flush=True)
        return 1

    matrix = np.vstack(all_vecs)
    args.out_npz.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.out_npz.with_suffix(".npz"),
        vectors=matrix,
        ids=np.array(ids, dtype=object),
    )
    meta = {
        "model": args.model,
        "device": device,
        "dim": int(matrix.shape[1]),
        "count": int(matrix.shape[0]),
        "seconds": round(time.time() - t0, 1),
    }
    args.out_npz.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
