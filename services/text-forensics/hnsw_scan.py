"""
Scale-out near-dup scan using FAISS HNSW.

Flat cosine is O(N^2) — dies past ~200k vectors. HNSW is O(N log N) build,
O(log N) query, memory ~64 * dim * N bytes. For 1M x 768 float32 ~= 200 GB is
too much; we drop to float16 in the HNSW graph and it fits.

Usage:
  python hnsw_scan.py <embeddings.npz> <fetch.jsonl> <out_leads.jsonl> \
      [--threshold 0.94] [--top-k 10] [--ef 128] [--M 32] \
      [--retraction-doi-file retracted_dois.txt] \
      [--jaccard-min 0.15] [--jaccard-check-top 5000]

Emits leads.jsonl (one per candidate pair above threshold) with an optional
lexical (6-gram Jaccard) sanity check applied to the top-N by cosine.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np


def load_meta(path: Path) -> dict[str, dict]:
    by_id: dict[str, dict] = {}
    with path.open() as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            by_id[rec["id"]] = rec
    return by_id


def award_ids(rec: dict) -> set[str]:
    return {g.get("award_id") for g in (rec.get("grants") or []) if g.get("award_id")}


def author_ids(rec: dict) -> set[str]:
    return {a.get("id") for a in (rec.get("authors") or []) if a.get("id")}


def title_norm(s: str) -> str:
    return re.sub(r"\W+", "", (s or "").lower())


def ngrams(s: str, n: int = 6) -> set[str]:
    s = re.sub(r"\W+", " ", (s or "").lower()).strip()
    toks = s.split()
    return set(" ".join(toks[i : i + n]) for i in range(len(toks) - n + 1))


def jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("embeddings", type=Path)
    ap.add_argument("meta", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--threshold", type=float, default=0.94)
    ap.add_argument("--top-k", type=int, default=10)
    ap.add_argument("--ef", type=int, default=128)
    ap.add_argument("--M", type=int, default=32)
    ap.add_argument("--retraction-doi-file", type=Path, default=None)
    ap.add_argument("--jaccard-min", type=float, default=0.0)
    ap.add_argument("--jaccard-check-top", type=int, default=0)
    args = ap.parse_args()

    print(f"load embeddings {args.embeddings}", flush=True)
    z = np.load(args.embeddings.with_suffix(".npz"), allow_pickle=True)
    vectors: np.ndarray = z["vectors"].astype(np.float32)
    ids: list[str] = list(z["ids"])
    n, dim = vectors.shape
    print(f"  {n} x {dim}", flush=True)

    print("load meta", flush=True)
    meta = load_meta(args.meta)
    print(f"  {len(meta)} records", flush=True)

    retracted: set[str] = set()
    if args.retraction_doi_file and args.retraction_doi_file.exists():
        with args.retraction_doi_file.open() as fh:
            retracted = {l.strip().lower().lstrip("https://doi.org/") for l in fh if l.strip()}
        print(f"retraction DOIs: {len(retracted)}", flush=True)

    import faiss  # type: ignore

    print(f"build HNSW M={args.M} efConstruction={args.ef}", flush=True)
    t0 = time.time()
    index = faiss.IndexHNSWFlat(dim, args.M, faiss.METRIC_INNER_PRODUCT)
    index.hnsw.efConstruction = args.ef
    index.add(vectors)
    print(f"  build {round(time.time()-t0,1)}s", flush=True)

    index.hnsw.efSearch = max(args.ef, args.top_k * 4)
    t0 = time.time()
    D, I = index.search(vectors, args.top_k + 1)
    print(f"  search {round(time.time()-t0,1)}s", flush=True)

    # Pass 1: emit raw leads above threshold (no jaccard).
    args.out.parent.mkdir(parents=True, exist_ok=True)
    raw_leads: list[dict] = []
    n_leads = 0
    with args.out.open("w") as out_fh:
        for i, self_id in enumerate(ids):
            self_rec = meta.get(self_id, {})
            self_awards = award_ids(self_rec)
            self_authors = author_ids(self_rec)
            self_doi = (self_rec.get("doi") or "").lower().lstrip("https://doi.org/")
            self_title_norm = title_norm(self_rec.get("title"))
            for j, s in zip(I[i], D[i]):
                if j == i or j < 0:
                    continue
                if s < args.threshold:
                    continue
                nb_id = ids[j]
                nb_rec = meta.get(nb_id, {})
                nb_awards = award_ids(nb_rec)
                nb_authors = author_ids(nb_rec)
                nb_doi = (nb_rec.get("doi") or "").lower().lstrip("https://doi.org/")
                # skip OpenAlex duplicate entries (same normalized title)
                if self_title_norm and self_title_norm == title_norm(nb_rec.get("title")):
                    continue
                cross_award = bool(self_awards and nb_awards and not (self_awards & nb_awards))
                same_author = bool(self_authors and nb_authors and (self_authors & nb_authors))
                rt = bool(retracted and (self_doi in retracted or nb_doi in retracted))
                lead = {
                    "a": self_id,
                    "b": nb_id,
                    "cosine": float(s),
                    "cross_award": cross_award,
                    "same_author": same_author,
                    "cross_author": not same_author,
                    "retracted": rt,
                    "a_title": self_rec.get("title"),
                    "b_title": nb_rec.get("title"),
                    "a_doi": self_rec.get("doi"),
                    "b_doi": nb_rec.get("doi"),
                    "a_year": self_rec.get("year"),
                    "b_year": nb_rec.get("year"),
                    "a_awards": sorted(self_awards),
                    "b_awards": sorted(nb_awards),
                }
                out_fh.write(json.dumps(lead) + "\n")
                raw_leads.append(lead)
                n_leads += 1

    # Pass 2: lexical Jaccard on the top-N by cosine (kills OpenAlex editor-summary noise).
    verified: list[dict] = []
    if args.jaccard_check_top > 0:
        print(f"lexical check on top {args.jaccard_check_top}", flush=True)
        # dedupe unordered pair
        seen = set()
        uniq = []
        for l in raw_leads:
            k = tuple(sorted([l["a"], l["b"]]))
            if k in seen:
                continue
            seen.add(k)
            uniq.append(l)
        uniq.sort(key=lambda x: x["cosine"], reverse=True)
        pool = uniq[: args.jaccard_check_top]
        ngram_cache: dict[str, set[str]] = {}
        def ng(i):
            if i in ngram_cache:
                return ngram_cache[i]
            ng = ngrams(meta.get(i, {}).get("abstract") or "")
            ngram_cache[i] = ng
            return ng
        for l in pool:
            ja = jaccard(ng(l["a"]), ng(l["b"]))
            l["jaccard6"] = ja
            if ja >= args.jaccard_min:
                verified.append(l)
        (args.out.parent / (args.out.stem + "_verified.jsonl")).write_text(
            "\n".join(json.dumps(v) for v in sorted(verified, key=lambda x: x["cosine"] * (1 + x["jaccard6"] * 3), reverse=True))
        )

    summary = {
        "vectors": n,
        "raw_leads": n_leads,
        "verified_leads": len(verified),
        "cross_author": sum(1 for l in verified if l["cross_author"]),
        "cross_award": sum(1 for l in verified if l["cross_award"]),
        "retracted": sum(1 for l in verified if l["retracted"]),
        "threshold": args.threshold,
        "jaccard_min": args.jaccard_min,
    }
    (args.out.parent / (args.out.stem + "_summary.json")).write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
