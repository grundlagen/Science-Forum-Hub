"""
Retraction-cluster analysis.

Joins the Retraction Watch DOI list (fetch_retractions.py output) against the
OpenAlex works.jsonl to find PIs / first-authors with multiple retractions.
Flags PIs with N+ retractions who still have federal awards in the same corpus.

Highest-signal FCA lead class: repeat retractor still billing NIH.

Usage:
  python retraction_cluster.py <works.jsonl> <retracted_dois.txt> <out.json>
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path


def norm_doi(s: str) -> str:
    return (s or "").lower().lstrip("https://doi.org/")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("works", type=Path)
    ap.add_argument("retracted", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--min-retractions", type=int, default=2)
    args = ap.parse_args()

    retracted = set()
    with args.retracted.open() as fh:
        for line in fh:
            d = line.strip().lower().lstrip("https://doi.org/")
            if d:
                retracted.add(d)
    print(f"retracted DOIs: {len(retracted)}", flush=True)

    author_hits: dict[str, list[dict]] = defaultdict(list)
    author_all_awards: dict[str, set[str]] = defaultdict(set)
    author_all_years: dict[str, list[int]] = defaultdict(list)
    for line in args.works.open():
        try:
            r = json.loads(line)
        except Exception:
            continue
        doi = norm_doi(r.get("doi") or "")
        authors = r.get("authors") or []
        for a in authors:
            name = a.get("name") or a.get("id")
            if not name:
                continue
            for g in (r.get("grants") or []):
                if g.get("award_id"):
                    author_all_awards[name].add(g["award_id"])
            if r.get("year"):
                author_all_years[name].append(r["year"])
            if doi in retracted:
                author_hits[name].append({
                    "openalex": r.get("id"),
                    "doi": r.get("doi"),
                    "year": r.get("year"),
                    "title": r.get("title"),
                    "awards": [g.get("award_id") for g in (r.get("grants") or []) if g.get("award_id")],
                })

    ranked = []
    for name, hits in author_hits.items():
        if len(hits) < args.min_retractions:
            continue
        awards = sorted(author_all_awards[name])
        years = author_all_years[name]
        max_year = max(years) if years else None
        min_ret_year = min((h["year"] or 9999) for h in hits)
        ranked.append({
            "name": name,
            "n_retractions": len(hits),
            "n_papers_in_corpus": len([y for y in years if y]),
            "n_awards": len(awards),
            "recent_year": max_year,
            "first_retraction_year": min_ret_year,
            "still_publishing": bool(max_year and max_year > min_ret_year),
            "awards": awards[:20],
            "retractions": hits[:20],
        })
    ranked.sort(key=lambda x: (x["n_retractions"], x["n_awards"]), reverse=True)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({
        "summary": {
            "total_flagged_authors": len(ranked),
            "still_publishing_after_retraction": sum(1 for r in ranked if r["still_publishing"]),
            "with_awards": sum(1 for r in ranked if r["n_awards"] > 0),
        },
        "top": ranked[:200],
    }, indent=2))
    print(f"flagged {len(ranked)} authors -> {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
