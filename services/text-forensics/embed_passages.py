"""
GPU batch SPECTER2 embeddings over passage JSONL from fetch_europepmc_fulltext.
Same shape as embed_abstracts.py but keys are `paper_id + section + passage_ix`.

Usage:
  python embed_passages.py <in.jsonl> <out_npz> [--batch 128] [--max N]
      [--sections METHODS,RESULTS,DISCUS,INTRO]
"""
from __future__ import annotations
import argparse, json, sys, time
from pathlib import Path
import numpy as np


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("in_path", type=Path)
    ap.add_argument("out_npz", type=Path)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--model", default="allenai/specter2_base")
    ap.add_argument("--max-len", type=int, default=512)
    ap.add_argument("--max", type=int, default=1_000_000)
    ap.add_argument("--sections", default="",
                    help="Comma-separated section prefixes to keep (e.g. METHOD,RESULT,DISCUS,INTRO). Empty = all.")
    ap.add_argument("--min-text", type=int, default=200,
                    help="Minimum passage text length in chars")
    args = ap.parse_args()

    import torch
    from transformers import AutoModel, AutoTokenizer
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device={device} model={args.model}", flush=True)
    tok = AutoTokenizer.from_pretrained(args.model)
    model = AutoModel.from_pretrained(args.model).to(device).eval()

    keep_sec = tuple(s.strip().upper() for s in args.sections.split(",") if s.strip())
    ids: list[str] = []
    all_vecs: list[np.ndarray] = []
    batch_ids: list[str] = []
    batch_txt: list[str] = []

    def flush():
        if not batch_txt: return
        enc = tok(batch_txt, padding=True, truncation=True, max_length=args.max_len, return_tensors="pt").to(device)
        with torch.no_grad():
            out = model(**enc)
        v = out.last_hidden_state[:, 0, :].cpu().numpy()
        v = v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
        ids.extend(batch_ids)
        all_vecs.append(v.astype(np.float32))
        batch_ids.clear(); batch_txt.clear()

    t0 = time.time(); n = 0
    with args.in_path.open() as fh:
        for line in fh:
            try: r = json.loads(line)
            except Exception: continue
            sec = (r.get("section") or "").upper()
            if keep_sec and not any(sec.startswith(p) for p in keep_sec):
                continue
            text = (r.get("text") or "").strip()
            if len(text) < args.min_text: continue
            key = f"{r.get('paper_id')}#{r.get('section')}#{r.get('passage_ix')}"
            batch_ids.append(key); batch_txt.append(text)
            n += 1
            if len(batch_txt) >= args.batch:
                flush()
                if n % (args.batch * 20) == 0:
                    rate = n / max(1e-3, time.time() - t0)
                    print(f"embedded {n} passages ({rate:.1f}/s)", flush=True)
            if n >= args.max: break
    flush()

    if not all_vecs:
        print("no vectors produced", flush=True); return 1
    matrix = np.vstack(all_vecs)
    args.out_npz.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.out_npz.with_suffix(".npz"), vectors=matrix, ids=np.array(ids, dtype=object))
    meta = {"model": args.model, "device": device, "dim": int(matrix.shape[1]),
            "count": int(matrix.shape[0]), "seconds": round(time.time()-t0,1),
            "sections_filter": list(keep_sec), "min_text": args.min_text}
    args.out_npz.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
