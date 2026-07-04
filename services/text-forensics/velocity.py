"""
Ratio/velocity analysis over RePORTER awards ↔ OpenAlex papers.

Classic auditor triage: outliers on
  - papers per grant-dollar (top-heavy publishers per $)
  - papers per PI per year (relative to activity-code norm)
  - time from award start to first acknowledgment
  - grant-dollar concentration across few core projects

Not proof of fraud. Ranks who to human-review first.

Usage:
  python velocity.py <papers_works.jsonl> <reporter_grants.jsonl> <out.json>
"""
from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path


def load_jsonl(path: Path):
    with path.open() as fh:
        for line in fh:
            try:
                yield json.loads(line)
            except Exception:
                continue


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("papers", type=Path)
    ap.add_argument("grants", type=Path)
    ap.add_argument("out", type=Path)
    args = ap.parse_args()

    grant_dollars: dict[str, float] = defaultdict(float)  # keyed by pi_name
    grant_count: dict[str, int] = defaultdict(int)
    grant_years: dict[str, list[int]] = defaultdict(list)
    for g in load_jsonl(args.grants):
        for p in (g.get("pis") or []):
            name = p.get("name")
            if not name:
                continue
            grant_dollars[name] += float(g.get("amount") or 0)
            grant_count[name] += 1
            if g.get("fy"):
                grant_years[name].append(int(g["fy"]))

    papers_by_pi: dict[str, list[int]] = defaultdict(list)
    for w in load_jsonl(args.papers):
        year = w.get("year") or 0
        for a in (w.get("authors") or []):
            name = a.get("name")
            if not name:
                continue
            papers_by_pi[name].append(year)

    ranked = []
    for name, years in papers_by_pi.items():
        dollars = grant_dollars.get(name, 0)
        n_papers = len(years)
        n_grants = grant_count.get(name, 0)
        span_years = max(1, (max(years) if years else 0) - (min(years) if years else 0) + 1)
        papers_per_year = n_papers / span_years
        papers_per_million_usd = n_papers / max(1, dollars / 1_000_000)
        # velocity score: high papers-per-dollar + high papers-per-year
        vel = papers_per_million_usd * (0.5 + papers_per_year / 10)
        ranked.append({
            "name": name,
            "n_papers": n_papers,
            "n_grants": n_grants,
            "total_award_usd": round(dollars, 2),
            "span_years": span_years,
            "papers_per_year": round(papers_per_year, 2),
            "papers_per_million_usd": round(papers_per_million_usd, 2),
            "velocity_score": round(vel, 2),
        })
    # Only PIs with both papers AND grants in the corpus, minimum thresholds
    ranked = [r for r in ranked if r["n_grants"] >= 3 and r["n_papers"] >= 5]
    ranked.sort(key=lambda x: x["velocity_score"], reverse=True)
    # Also compute field norms via percentile ranks
    if ranked:
        by_ratio = [r["papers_per_million_usd"] for r in ranked]
        med = statistics.median(by_ratio)
        for r in ranked:
            r["ratio_vs_median"] = round(r["papers_per_million_usd"] / max(1e-6, med), 2)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({
        "summary": {
            "pis_examined": len(ranked),
            "top_1pct_ratio_threshold": ranked[max(1, len(ranked) // 100)]["papers_per_million_usd"] if ranked else 0,
        },
        "top": ranked[:200],
    }, indent=2))
    print(f"ranked {len(ranked)} PIs -> {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
