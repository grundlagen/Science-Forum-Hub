"""
Benford / digit-distribution scan over reported statistics in abstracts.

Fabricated numbers deviate from natural digit distributions. Two checks per author:
  - first-digit Benford (P(d)=log10(1+1/d)) — catches invented magnitudes
  - last-digit uniformity — humans over-use certain terminal digits when inventing
Flag authors with N>=30 extracted numbers who fail chi^2 at p<0.01 on either.

Runs on any {title, abstract, id, authors[]} JSONL. Cheap CPU. Full-text version
lives in extract_numbers_fulltext.py (TODO).

Usage:
  python benford.py <works.jsonl> <out.json> [--min-n 30]
"""
from __future__ import annotations

import argparse
import json
import math
import re
from collections import defaultdict
from pathlib import Path

# Match numbers with 1-6 significant digits, optional decimal, avoiding years / PMIDs.
NUM = re.compile(r"(?<![\d.])([1-9]\d*(?:\.\d+)?|0?\.\d+)(?![\d.])")

BENFORD_FIRST = [math.log10(1 + 1 / d) for d in range(1, 10)]


def digits(s: str) -> tuple[str, str] | None:
    # strip 4-digit year-like tokens (1900-2099)
    if len(s) == 4 and s.isdigit() and 1900 <= int(s) <= 2099:
        return None
    # strip trailing 5-digit-plus IDs
    if s.isdigit() and len(s) >= 6:
        return None
    # first significant digit
    core = s.lstrip("0.").lstrip("0")
    first = None
    for c in core:
        if c.isdigit() and c != "0":
            first = c
            break
    # last digit of the integer part
    integer_part = s.split(".")[0].lstrip("-0") or "0"
    last = integer_part[-1] if integer_part.isdigit() else None
    if first is None or last is None:
        return None
    return first, last


def chi2(observed: list[int], expected: list[float]) -> float:
    tot = sum(observed)
    exp = [e * tot for e in expected]
    return sum(((o - e) ** 2) / e for o, e in zip(observed, exp) if e > 0)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("works", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--min-n", type=int, default=200)
    ap.add_argument("--min-crit-mult", type=float, default=3.0,
                    help="chi-crit multiplier — 3.0 means 3x the p=0.01 crit value (much stricter than default)")
    args = ap.parse_args()

    per_author_first: dict[str, list[int]] = defaultdict(lambda: [0] * 9)
    per_author_last: dict[str, list[int]] = defaultdict(lambda: [0] * 10)
    per_author_n: dict[str, int] = defaultdict(int)
    author_names: dict[str, str] = {}

    for line in args.works.open():
        try:
            r = json.loads(line)
        except Exception:
            continue
        text = (r.get("abstract") or "") + " " + (r.get("title") or "")
        nums: list[tuple[str, str]] = []
        for m in NUM.findall(text):
            d = digits(m)
            if d:
                nums.append(d)
        if not nums:
            continue
        for a in (r.get("authors") or []):
            aid = a.get("id") or a.get("name")
            if not aid:
                continue
            author_names[aid] = a.get("name") or aid
            for first, last in nums:
                per_author_first[aid][int(first) - 1] += 1
                per_author_last[aid][int(last)] += 1
                per_author_n[aid] += 1

    # chi^2 critical at df=8 p<0.01 = 20.09; df=9 p<0.01 = 21.67
    CRIT_FIRST = 20.09 * args.min_crit_mult
    CRIT_LAST = 21.67 * args.min_crit_mult
    flagged = []
    for aid, n in per_author_n.items():
        if n < args.min_n:
            continue
        chi_first = chi2(per_author_first[aid], BENFORD_FIRST)
        chi_last = chi2(per_author_last[aid], [0.1] * 10)
        if chi_first > CRIT_FIRST or chi_last > CRIT_LAST:
            flagged.append({
                "author_id": aid,
                "name": author_names.get(aid),
                "n_numbers": n,
                "chi_first_digit": round(chi_first, 2),
                "chi_last_digit": round(chi_last, 2),
                "first_dist": per_author_first[aid],
                "last_dist": per_author_last[aid],
            })
    flagged.sort(key=lambda x: max(x["chi_first_digit"], x["chi_last_digit"]), reverse=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({
        "summary": {
            "authors_examined": sum(1 for n in per_author_n.values() if n >= args.min_n),
            "flagged": len(flagged),
            "min_n": args.min_n,
        },
        "top": flagged[:100],
    }, indent=2))
    print(f"flagged {len(flagged)} -> {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
