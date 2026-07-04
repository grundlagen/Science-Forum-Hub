"""
Benford / digit-distribution scan over VALIDATED SUMMARY STATISTICS ONLY.

Fix for the original abstract-wide benford.py: 91% of authors flagged because
astronomy/cosmology catalog numbers (bounded, fixed-precision) mechanically
violate Benford independent of data integrity. Benford's domain of validity is
self-reported summary statistics (means, SDs), not raw catalog/instrument dumps.

This runs the GRIM triple extractor on each passage, keeps only the (mean, sd)
values that come out of a validated triple (adjacent to an explicit sample-size
marker), aggregates first-digit and last-digit distributions per author, and
flags authors with N>=100 validated statistics failing chi^2 at p<0.001.

Usage:
  python benford_triples.py <passages.jsonl> <works.jsonl> <out.json>
      [--min-n 100] [--min-crit-mult 5.0]
"""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict
from pathlib import Path


BENFORD_FIRST = [math.log10(1 + 1 / d) for d in range(1, 10)]


def digits(s: str) -> tuple[str, str] | None:
    core = (s or "").lstrip("-0.").lstrip("0")
    first = None
    for c in core:
        if c.isdigit() and c != "0":
            first = c; break
    int_part = s.split(".")[0].lstrip("-0") or "0"
    last = int_part[-1] if int_part.isdigit() else None
    if first is None or last is None:
        return None
    return first, last


def chi2(observed: list[int], expected: list[float]) -> float:
    tot = sum(observed)
    exp = [e * tot for e in expected]
    return sum(((o - e) ** 2) / e for o, e in zip(observed, exp) if e > 0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("passages", type=Path)
    ap.add_argument("works", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--min-n", type=int, default=100)
    ap.add_argument("--min-crit-mult", type=float, default=5.0,
                    help="chi-crit multiplier; 5x p=0.01 crit is a strict threshold")
    args = ap.parse_args()

    sys.path.insert(0, str(Path(__file__).parent))
    from grim import extract_triples  # noqa: E402

    # Load paper_id -> authors mapping.
    paper_authors: dict[str, list[dict]] = {}
    with args.works.open() as fh:
        for line in fh:
            try:
                r = json.loads(line)
                paper_authors[r["id"]] = r.get("authors") or []
            except Exception:
                pass
    print(f"papers with authors: {len(paper_authors)}", flush=True)

    first_by_author: dict[str, list[int]] = defaultdict(lambda: [0] * 9)
    last_by_author: dict[str, list[int]] = defaultdict(lambda: [0] * 10)
    n_by_author: dict[str, int] = defaultdict(int)
    author_names: dict[str, str] = {}

    n_passages = 0
    n_triples = 0
    with args.passages.open() as fh:
        for line in fh:
            try:
                r = json.loads(line)
            except Exception:
                continue
            text = r.get("text") or ""
            if len(text) < 60:
                continue
            authors = paper_authors.get(r.get("paper_id"), [])
            if not authors:
                continue
            for mean_s, sd_s, n_val, _ in extract_triples(text):
                for value in [mean_s, sd_s if sd_s and sd_s != "PARSE_FAIL" else None]:
                    if not value:
                        continue
                    d = digits(value)
                    if not d:
                        continue
                    first, last = d
                    for a in authors:
                        aid = a.get("id") or a.get("name")
                        if not aid:
                            continue
                        author_names[aid] = a.get("name") or aid
                        first_by_author[aid][int(first) - 1] += 1
                        last_by_author[aid][int(last)] += 1
                        n_by_author[aid] += 1
                    n_triples += 1
            n_passages += 1

    CRIT_FIRST = 20.09 * args.min_crit_mult
    CRIT_LAST = 21.67 * args.min_crit_mult
    flagged = []
    for aid, n in n_by_author.items():
        if n < args.min_n:
            continue
        cf = chi2(first_by_author[aid], BENFORD_FIRST)
        cl = chi2(last_by_author[aid], [0.1] * 10)
        if cf > CRIT_FIRST or cl > CRIT_LAST:
            flagged.append({
                "author_id": aid,
                "name": author_names.get(aid),
                "n_values": n,
                "chi_first": round(cf, 2),
                "chi_last": round(cl, 2),
            })
    flagged.sort(key=lambda x: max(x["chi_first"], x["chi_last"]), reverse=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({
        "summary": {
            "passages_scanned": n_passages,
            "triples_extracted": n_triples,
            "authors_examined": sum(1 for n in n_by_author.values() if n >= args.min_n),
            "flagged": len(flagged),
            "min_n": args.min_n,
            "crit_mult": args.min_crit_mult,
        },
        "top": flagged[:100],
    }, indent=2))
    print(json.dumps({"passages": n_passages, "triples": n_triples,
                      "flagged": len(flagged)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
