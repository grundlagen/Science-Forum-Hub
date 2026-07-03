"""
Near-duplicate + cross-award scan over the SPECTER2 embeddings.

Logic:
  1. Build a FAISS inner-product index (vectors already L2-normalized -> cosine).
  2. For every vector, take top-K neighbours above --threshold.
  3. Join back to the JSONL metadata (authors, grants) to compute:
       - cross_award  : neighbour shares no NIH award_id with self
       - same_author  : neighbour shares at least one authorship
       - retracted    : either paper appears in Retraction Watch DOI set (optional)
  4. Emit ranked leads JSONL. FCA-relevant class = high similarity + cross_award +
     same_author = one PI recycling near-identical text across different awards.

Usage:
  python near_dup_scan.py <embeddings.npz> <fetch.jsonl> <out_leads.jsonl> \
      [--threshold 0.94] [--top-k 5] [--retraction-doi-file retracted_dois.txt]
"""
from __future__ import annotations

import argparse
import json
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("embeddings", type=Path)
    ap.add_argument("meta", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--threshold", type=float, default=0.94)
    ap.add_argument("--top-k", type=int, default=5)
    ap.add_argument("--retraction-doi-file", type=Path, default=None)
    args = ap.parse_args()

    print(f"load embeddings {args.embeddings}", flush=True)
    z = np.load(args.embeddings.with_suffix(".npz"), allow_pickle=True)
    vectors: np.ndarray = z["vectors"].astype(np.float32)
    ids: list[str] = list(z["ids"])
    print(f"  {vectors.shape[0]} vectors x {vectors.shape[1]} dim", flush=True)

    print(f"load meta {args.meta}", flush=True)
    meta = load_meta(args.meta)
    print(f"  {len(meta)} records", flush=True)

    retracted_dois: set[str] = set()
    if args.retraction_doi_file and args.retraction_doi_file.exists():
        with args.retraction_doi_file.open() as fh:
            retracted_dois = {l.strip().lower() for l in fh if l.strip()}
        print(f"retraction DOIs: {len(retracted_dois)}", flush=True)

    try:
        import faiss  # type: ignore
        index = faiss.IndexFlatIP(vectors.shape[1])
        index.add(vectors)
        print("faiss IndexFlatIP built", flush=True)
        t0 = time.time()
        # +1 top-k: self is always the top hit
        D, I = index.search(vectors, args.top_k + 1)
        print(f"faiss search {round(time.time()-t0,1)}s", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"faiss unavailable ({e}); falling back to numpy", flush=True)
        t0 = time.time()
        sims = vectors @ vectors.T
        I = np.argpartition(-sims, args.top_k + 1, axis=1)[:, : args.top_k + 1]
        D = np.take_along_axis(sims, I, axis=1)
        print(f"numpy search {round(time.time()-t0,1)}s", flush=True)

    leads = 0
    per_paper_leads: dict[str, list[dict]] = defaultdict(list)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w") as out_fh:
        for i, self_id in enumerate(ids):
            self_rec = meta.get(self_id, {})
            self_awards = award_ids(self_rec)
            self_authors = author_ids(self_rec)
            self_doi = (self_rec.get("doi") or "").lower().lstrip("https://doi.org/")
            for rank, (j, s) in enumerate(zip(I[i], D[i])):
                if j == i:
                    continue
                if s < args.threshold:
                    continue
                nb_id = ids[j]
                nb_rec = meta.get(nb_id, {})
                nb_awards = award_ids(nb_rec)
                nb_authors = author_ids(nb_rec)
                nb_doi = (nb_rec.get("doi") or "").lower().lstrip("https://doi.org/")
                cross_award = bool(self_awards and nb_awards and not (self_awards & nb_awards))
                same_author = bool(self_authors and nb_authors and (self_authors & nb_authors))
                retracted = bool(retracted_dois and (self_doi in retracted_dois or nb_doi in retracted_dois))
                # Score: FCA-flavored weighting
                score = float(s) * (
                    1.0
                    + 0.6 * cross_award
                    + 0.4 * same_author
                    + 0.5 * retracted
                )
                lead = {
                    "a": self_id,
                    "b": nb_id,
                    "cosine": float(s),
                    "score": score,
                    "cross_award": cross_award,
                    "same_author": same_author,
                    "retracted": retracted,
                    "a_title": self_rec.get("title"),
                    "b_title": nb_rec.get("title"),
                    "a_awards": sorted(self_awards),
                    "b_awards": sorted(nb_awards),
                }
                out_fh.write(json.dumps(lead) + "\n")
                per_paper_leads[self_id].append(lead)
                leads += 1

    summary = {
        "vectors": len(ids),
        "leads": leads,
        "papers_with_leads": sum(1 for v in per_paper_leads.values() if v),
        "threshold": args.threshold,
        "out": str(args.out),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
