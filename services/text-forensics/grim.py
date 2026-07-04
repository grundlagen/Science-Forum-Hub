"""
GRIM (Granularity-Related Inconsistency of Means) detector.

Extracts (mean, n) — and optionally (mean, SD, n) — triples from passage text,
then checks arithmetic possibility for the mean given N integer-valued observations.

GRIM insight (Brown & Heathers, 2016): if N integer values sum to S, mean = S/N.
Any reported mean with D decimal places must equal round(k/N, D) for some integer k.
If no such k exists within rounding tolerance, the mean is arithmetically impossible.

Only informative when the underlying variable is plausibly integer-valued
(clinical event counts, Likert scale, categorical outcomes). Not a fraud finding
alone — a red flag for human review.

Runs on any {paper_id, section, passage_ix, text} JSONL. Cheap CPU.

Usage:
  python grim.py <passages.jsonl> <out.jsonl> [--max N] [--sections METHOD,RESULT]
"""
from __future__ import annotations
import argparse, json, math, re, sys, time
from pathlib import Path


# Patterns that catch common "mean X (SD Y), n = Z" formulations.
# We deliberately over-match; the arithmetic check filters false positives.
PAT_TRIPLE = re.compile(
    r"""(?ix)
    (?:mean|M|average|\\bavg)\s*[:=]?\s*
    (?P<mean>-?\d+\.\d{1,3})            # mean with at least 1 decimal
    \s*
    (?:                                  # optional SD
        (?:\(|\[)?\s*
        (?:sd|std|s\.d\.|standard\s+deviation|\\u00b1|\+/-)\s*[:=]?\s*
        (?P<sd>-?\d+\.\d{1,3})
        \s*(?:\)|\])?
    )?
    [^\n]{0,80}?                        # up to 80 chars glue
    (?:n|N|sample\s+size)\s*[:=]?\s*(?P<n>\d{1,5})
    """
)


def grim_ok(mean_s: str, n: int) -> tuple[bool, float]:
    """Return (possible, min_gap). mean_s is the string form (preserves precision)."""
    if n <= 0 or n > 10000:
        return True, 0.0
    if "." not in mean_s:
        return True, 0.0
    dp = len(mean_s.split(".")[1])
    try:
        mean = float(mean_s)
    except ValueError:
        return True, 0.0
    tol = 0.5 * 10 ** (-dp)  # rounding half-tolerance
    # k = round(mean * n) should give mean == round(k/n, dp) within tol
    k = round(mean * n)
    # Check a few candidate integer sums around k
    best_gap = 1.0
    for cand in (k - 1, k, k + 1):
        approx = round(cand / n, dp)
        gap = abs(approx - mean)
        if gap <= tol:
            return True, 0.0
        best_gap = min(best_gap, gap)
    return False, best_gap


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("passages", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--max", type=int, default=1_000_000)
    ap.add_argument("--sections", default="METHOD,RESULT")
    ap.add_argument("--min-n", type=int, default=6)     # tiny N triggers false positives
    ap.add_argument("--max-n", type=int, default=1000)  # very large N — too many integer solutions
    args = ap.parse_args()

    keep = tuple(s.strip().upper() for s in args.sections.split(",") if s.strip())
    args.out.parent.mkdir(parents=True, exist_ok=True)

    n_papers = 0
    n_triples = 0
    n_flagged = 0
    per_paper: dict[str, int] = {}
    t0 = time.time()
    with args.passages.open() as fh, args.out.open("w") as out_fh:
        for line in fh:
            try:
                r = json.loads(line)
            except Exception:
                continue
            sec = (r.get("section") or "").upper()
            if keep and not any(sec.startswith(p) for p in keep):
                continue
            text = r.get("text") or ""
            if len(text) < 60:
                continue
            for m in PAT_TRIPLE.finditer(text):
                mean_s = m.group("mean")
                n_s = m.group("n")
                sd_s = m.group("sd")
                try:
                    n = int(n_s)
                except (TypeError, ValueError):
                    continue
                if n < args.min_n or n > args.max_n:
                    continue
                n_triples += 1
                ok, gap = grim_ok(mean_s, n)
                if ok:
                    continue
                lead = {
                    "paper_id": r.get("paper_id"),
                    "pmid": r.get("pmid"),
                    "pmcid": r.get("pmcid"),
                    "section": r.get("section"),
                    "passage_ix": r.get("passage_ix"),
                    "mean": mean_s,
                    "sd": sd_s,
                    "n": n,
                    "min_gap": round(gap, 6),
                    "quote": m.group(0)[:180],
                }
                out_fh.write(json.dumps(lead) + "\n")
                n_flagged += 1
                per_paper[r.get("paper_id") or ""] = per_paper.get(r.get("paper_id") or "", 0) + 1
            n_papers += 1
            if n_papers % 20000 == 0:
                print(f"scanned {n_papers} passages  triples={n_triples}  flagged={n_flagged}", flush=True)
            if n_papers >= args.max:
                break
    top_papers = sorted(per_paper.items(), key=lambda x: -x[1])[:50]
    summary = {
        "passages_scanned": n_papers,
        "triples_extracted": n_triples,
        "grim_flagged": n_flagged,
        "papers_with_flags": len(per_paper),
        "top_paper_flag_counts": top_papers,
        "seconds": round(time.time() - t0, 1),
    }
    (args.out.parent / (args.out.stem + "_summary.json")).write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
