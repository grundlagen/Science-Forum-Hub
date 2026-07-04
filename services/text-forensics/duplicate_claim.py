"""
Duplicate-claim detection: same paper acknowledged to multiple non-overlapping
awards, or same experimental work acknowledged across seemingly independent PIs.

Direct FCA theory — the Duke case territory. Pure join over the acknowledged
`grants[]` block we already extract from OpenAlex.

Two passes:
  1. Multi-agency acknowledgement — a single paper crediting >=2 federal funders.
     Not fraud alone, but the population from which double-billing draws.
  2. Overlapping-period double-count — the same core project number appearing in
     papers acknowledged to a *different* PI's award list (a lab crediting its
     collaborator's grant to boost its productivity metric).

Usage:
  python duplicate_claim.py <works.jsonl> <out.json>
"""
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("works", type=Path)
    ap.add_argument("out", type=Path)
    args = ap.parse_args()

    multi_funder: list[dict] = []
    award_to_papers: dict[str, list[dict]] = defaultdict(list)
    award_to_pi_sets: dict[str, set[str]] = defaultdict(set)

    for line in args.works.open():
        try:
            r = json.loads(line)
        except Exception:
            continue
        grants = r.get("grants") or []
        funders = {g.get("funder") for g in grants if g.get("funder")}
        awards = [g.get("award_id") for g in grants if g.get("award_id")]
        authors = tuple(sorted((a.get("id") or a.get("name") or "") for a in (r.get("authors") or [])))
        if len(funders) >= 2:
            multi_funder.append({
                "id": r.get("id"),
                "doi": r.get("doi"),
                "title": r.get("title"),
                "year": r.get("year"),
                "funders": sorted(funders),
                "awards": awards,
            })
        for aw in awards:
            award_to_papers[aw].append({
                "id": r.get("id"),
                "doi": r.get("doi"),
                "year": r.get("year"),
                "authors_key": authors,
                "title": r.get("title"),
            })
            award_to_pi_sets[aw].add(authors)

    # Awards credited across disjoint author-sets = collaborator-boost / claim-sharing
    conflicts = []
    for aw, pi_sets in award_to_pi_sets.items():
        if len(pi_sets) < 2:
            continue
        # any pair of author sets with no overlap?
        sets_list = [set(s) for s in pi_sets]
        disjoint_pairs = 0
        for i in range(len(sets_list)):
            for j in range(i + 1, len(sets_list)):
                if not (sets_list[i] & sets_list[j]):
                    disjoint_pairs += 1
        if disjoint_pairs == 0:
            continue
        conflicts.append({
            "award_id": aw,
            "distinct_author_sets": len(pi_sets),
            "disjoint_pairs": disjoint_pairs,
            "n_papers": len(award_to_papers[aw]),
            "sample_titles": [p["title"] for p in award_to_papers[aw][:5]],
        })
    conflicts.sort(key=lambda x: (x["disjoint_pairs"], x["n_papers"]), reverse=True)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({
        "summary": {
            "multi_funder_papers": len(multi_funder),
            "award_conflicts": len(conflicts),
        },
        "multi_funder_sample": multi_funder[:100],
        "top_award_conflicts": conflicts[:100],
    }, indent=2))
    print(f"multi-funder papers: {len(multi_funder)}  award conflicts: {len(conflicts)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
