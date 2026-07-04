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


# Strict triple extraction. Common failure modes we explicitly reject:
#   - "median = 12" giving n=12 (the letter 'n' inside 'median')
#   - "equation 7" giving n=7 (trailing integer with no sample-size context)
#   - "exon 19" giving n=19 (biological ordinal, not sample size)
# Approach: find MEAN anchor first, then in a ±120-char window require an
# explicit sample-size marker AND reject if a rejection word neighbors the integer.

PAT_MEAN = re.compile(
    r"""(?ix)
    (?<![A-Za-z])                       # not preceded by another letter
    (?:mean|average|\bM\b|\bavg\b|\bμ\b)
    \s*(?:of|was|were|is|are|=|:)?\s*
    (?P<mean>-?\d+\.\d{1,4})
    """
)

# Explicit sample-size markers only. "n = <int>", "N = <int>", "sample size <op> <int>",
# "sample of <int>", "(n = <int>)", "n=<int>". Require word-boundary on n/N.
PAT_N = re.compile(
    r"""(?x)
    (?:
        \((?:\s*[nN]\s*[:=]\s*(?P<n1>\d{1,5})\s*\))
      | (?:\b[nN]\s*[:=]\s*(?P<n2>\d{1,5})\b)
      | (?:\bsample\s+size\s*(?:of|=|:)?\s*(?P<n3>\d{1,5})\b)
      | (?:\bsample\s+of\s*(?P<n4>\d{1,5})\s+(?:participants|subjects|patients|animals|rats|mice|cells|samples))
    )
    """
)

# Reject rules for the immediate word BEFORE the integer, to avoid median/equation/etc.
REJECT_LABELS = re.compile(
    r"\b(median|mode|range|equation|eqn|eq|figure|fig|table|tbl|section|"
    r"exon|intron|chromosome|chr|page|pp|ref(?:erence)?|"
    r"chapter|volume|vol|version|ver|revision|"
    r"row|col|item|question|item|iter|epoch|batch|"
    r"protocol|study|arm|group|day|month|year|week|hour|min|s(?:econd)?|"
    r"cohort|panel)\b\s*[:=]?\s*$",
    re.IGNORECASE,
)

# SD variants — handle 's.d.', 'S.D.', 'SD', 'std', 'standard deviation', '±', '+/-'.
PAT_SD = re.compile(
    r"""(?ix)
    (?:
        (?:s\.?\s*d\.?|std\.?|standard\s+deviation|±|\+/-)
        \s*[:=]?\s*
        (?P<sd>-?\d+\.\d{1,4})
    )
    """
)


def extract_triples(text: str) -> list[tuple[str, str | None, int, str]]:
    """Return list of (mean_s, sd_s or None, n, quote) triples with strict n context."""
    out = []
    for m in PAT_MEAN.finditer(text):
        mean_s = m.group("mean")
        span_start = max(0, m.start() - 20)
        span_end = min(len(text), m.end() + 120)
        window = text[span_start:span_end]
        # Check for explicit N marker in this window
        n_val = None
        n_span = None
        for nm in PAT_N.finditer(window):
            # Reject if word directly before integer is a rejection label
            candidate = nm.group("n1") or nm.group("n2") or nm.group("n3") or nm.group("n4")
            if not candidate:
                continue
            # Find rejection: 20 chars before the integer inside the window
            int_start_in_window = nm.start() + nm.group(0).rfind(candidate)
            pre = window[max(0, int_start_in_window - 20):int_start_in_window]
            if REJECT_LABELS.search(pre):
                continue
            try:
                n_val = int(candidate)
                n_span = nm.start()
            except ValueError:
                continue
            break
        if n_val is None:
            continue
        # SD extraction in the same window
        sd_s = None
        sdm = PAT_SD.search(window)
        if sdm:
            sd_s = sdm.group("sd")
        else:
            # Silent-failure guard: if 's.d.' or 'sd' appears in window but we couldn't parse
            if re.search(r"\bs\.?\s*d\.?|\bsd\b", window, re.IGNORECASE):
                sd_s = "PARSE_FAIL"
        quote = text[m.start():min(len(text), m.start() + 200)].replace("\n", " ")[:200]
        out.append((mean_s, sd_s, n_val, quote))
    return out


# Legacy compatibility for validation script
PAT_TRIPLE = PAT_MEAN


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
            for mean_s, sd_s, n, quote in extract_triples(text):
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
                    "quote": quote[:180],
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
