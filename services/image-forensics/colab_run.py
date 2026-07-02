"""
End-to-end orchestrator for a GPU run (Colab) with a GitHub-mediated edit loop.

Pipeline: [optional harvest] -> build the panel embedding index (DINOv2 on GPU if
present, else classic) -> scan every panel against the whole corpus for CROSS-ARTICLE
near-duplicates -> geometrically confirm the top leads with ORB/RANSAC -> write a
machine-readable results.json + a human summary.md.

The results files are what you commit back to the branch so the other side of the loop
(the editor) can read outcomes and change thresholds/detectors, then you re-run.

Usage (Colab cell):
    !python colab_run.py --corpus ./corpus --index ./corpus_index \
        --harvest 'GRANT_AGENCY:"NIH" AND OPEN_ACCESS:y' --harvest-n 300 \
        --threshold 0.92 --out results.json

Everything is a LEAD for human review, never a finding.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import cv2
import numpy as np

from embedding_index import PanelIndex, build_from_dir, MATCH_THRESHOLD
from detector import orb_findings, MIN_RANSAC_INLIERS


def article_of(key: str) -> str:
    """Article id from a panel key '<article>/<file>#p<i>'."""
    return key.split("/", 1)[0].split("#", 1)[0]


def load_panel(corpus: Path, key: str) -> np.ndarray | None:
    # key = '<article>/<file>#p<i>'; the source figure file is everything before '#'.
    rel = key.split("#", 1)[0]
    p = corpus / rel
    return cv2.imread(str(p), cv2.IMREAD_GRAYSCALE) if p.exists() else None


def orb_confirm(a: np.ndarray, b: np.ndarray) -> tuple[bool, str]:
    """Flip-aware ORB/RANSAC confirmation: test b and its mirror, keep the stronger."""
    best = None
    for label, img in (("direct", b), ("mirrored", b[:, ::-1])):
        f = orb_findings({"a": a, "b": img}, ["a", "b"])
        if f and (best is None or f[0].score > best[0]):
            best = (f[0].score, f"{label}: {f[0].detail}")
    if best is None:
        return False, "no ORB match"
    return best[0] >= MIN_RANSAC_INLIERS, best[1]


def scan_corpus(idx: PanelIndex, corpus: Path, threshold: float, top_k: int, confirm: int) -> list[dict]:
    """Rank cross-article near-duplicate panel pairs, then ORB-confirm the top ones.

    Operates on the STORED panel embeddings (consistent with what was indexed), not on
    re-read figure files.
    """
    vectors = idx.all_vectors()
    seen: set[tuple[str, str]] = set()
    leads: list[dict] = []
    for i, key in enumerate(idx.keys):
        for hit in idx.query_vector(vectors[i], top_k=top_k, exclude=key):
            if hit.similarity < threshold:
                break  # query is sorted desc
            if article_of(hit.key) == article_of(key):
                continue  # same paper reusing its own panel is not cross-literature reuse
            pair = tuple(sorted([key, hit.key]))
            if pair in seen:
                continue
            seen.add(pair)
            leads.append({"a": pair[0], "b": pair[1], "similarity": round(hit.similarity, 4), "confirmed": None})
    leads.sort(key=lambda d: -d["similarity"])

    # Geometric confirmation on the strongest leads (flip-aware ORB/RANSAC).
    for lead in leads[:confirm]:
        a = load_panel(corpus, lead["a"])
        b = load_panel(corpus, lead["b"])
        if a is None or b is None:
            continue
        ok, detail = orb_confirm(a, b)
        lead["confirmed"] = ok
        lead["orb_detail"] = detail
    return leads


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", default="./corpus")
    ap.add_argument("--index", default="./corpus_index")
    ap.add_argument("--harvest", default=None, help="Europe PMC query; omit to skip harvesting")
    ap.add_argument("--harvest-n", type=int, default=200)
    ap.add_argument("--threshold", type=float, default=MATCH_THRESHOLD)
    ap.add_argument("--top-k", type=int, default=5)
    ap.add_argument("--confirm", type=int, default=50, help="how many top leads to ORB-confirm")
    ap.add_argument("--out", default="results.json")
    args = ap.parse_args()
    corpus = Path(args.corpus)

    t0 = time.time()
    if args.harvest:
        from harvest_figures import search_pmcids, fetch_figures

        corpus.mkdir(parents=True, exist_ok=True)
        pmcids = search_pmcids(args.harvest, args.harvest_n)
        for pmcid in pmcids:
            fetch_figures(pmcid, corpus)
        print(f"harvested figures for {len(pmcids)} articles into {corpus}")

    idx = build_from_dir(corpus, Path(args.index))
    leads = scan_corpus(idx, corpus, args.threshold, args.top_k, args.confirm)
    confirmed = [l for l in leads if l["confirmed"]]

    results = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "backend": idx.backend,
        "corpus": str(corpus),
        "panels_indexed": len(idx.keys),
        "articles": len({article_of(k) for k in idx.keys}),
        "threshold": args.threshold,
        "leads": leads,
        "leads_total": len(leads),
        "leads_orb_confirmed": len(confirmed),
        "runtime_seconds": round(time.time() - t0, 1),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, indent=2))

    md = [
        f"# Corpus duplication scan — {results['generated']}",
        "",
        f"- backend: `{results['backend']}`  | panels: {results['panels_indexed']}  | articles: {results['articles']}",
        f"- threshold: {results['threshold']}  | leads: {results['leads_total']}  | ORB-confirmed: {results['leads_orb_confirmed']}",
        f"- runtime: {results['runtime_seconds']}s",
        "",
        "## Top leads (probable cause for human review, not findings)",
        "",
        "ORB-confirmed = geometry check passed (textured panels). Embedding-only leads",
        "still matter — low-texture panels (blots/microscopy, the Dana-Farber type) score",
        "high on embedding but yield few ORB keypoints, so review them by eye.",
        "",
    ]
    for l in leads[:25]:
        tag = "CONFIRMED" if l["confirmed"] else "embedding-only"
        md.append(f"- [{tag}] sim={l['similarity']}  `{l['a']}`  <->  `{l['b']}`  ({l.get('orb_detail','')})")
    if not leads:
        md.append("- no cross-article panel pairs above threshold this run.")
    out.with_suffix(".md").write_text("\n".join(md))

    print(f"{results['leads_total']} leads, {results['leads_orb_confirmed']} ORB-confirmed -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
