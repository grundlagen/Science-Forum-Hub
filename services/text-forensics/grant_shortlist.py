"""
Grant-reuse shortlist filter — post-process minhash_grants output.

Rejects multi-site companion applications (NIH design pattern: two co-funded
sites submit matching text per site — high jaccard is required behavior, not
evidence). Also rejects trivially-similar within-institution PI transitions
(same title, same org, small FY gap = R01 handed to successor PI).

Emits a tightened shortlist for R-series cross-institution cross-PI pairs.

Usage:
  python grant_shortlist.py <grant_reuse_leads.jsonl> <out_shortlist.jsonl>
      [--jac-min 0.95] [--activity-prefix R] [--reject-multisite]
"""
from __future__ import annotations
import argparse, json, re
from pathlib import Path

# Multi-site companion-application title markers.
# NIH pattern: "1/2 Multi-site Study: X", "2/2 Multisite Trial: X",
# "Site 1: X", "Coordinating Center: X", "Data Coordinating Center", etc.
MULTISITE_RE = re.compile(
    r"""(?ix)
    (?:
        \b\d\s*/\s*\d\b                           # 1/2 or 2/2
      | \bmulti[-\s]?site\b
      | \bmultisite\b
      | \bcoordinating\s+center\b
      | \bdata\s+coordinating\b
      | \bsite\s+\d+\b
      | \bcompanion\s+application\b
      | \b(?:linked|paired)\s+R01\b
      | \bcollaborative\s+(?:R01|R21)\b
      | \bcompanion\s+PPG\b
      | \bU01\s+multi\b
    )
    """
)


def is_multisite(title: str) -> bool:
    return bool(title and MULTISITE_RE.search(title))


def is_within_org_transition(l: dict) -> bool:
    """Same org, same title, small FY gap = PI transition on continuing project."""
    if not l.get("same_org"):
        return False
    a_t = (l.get("a_title") or "").lower().strip()
    b_t = (l.get("b_title") or "").lower().strip()
    if a_t != b_t:
        return False
    fy_a = l.get("a_fy") or 0
    fy_b = l.get("b_fy") or 0
    return abs(fy_a - fy_b) <= 6  # renewal cycle typically 5 years


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("leads", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--jac-min", type=float, default=0.95)
    ap.add_argument("--activity-prefix", default="R",
                    help="First-letter of activity code required for both sides (R=research)")
    ap.add_argument("--reject-multisite", action="store_true", default=True)
    ap.add_argument("--allow-same-org", action="store_true", default=False,
                    help="If unset (default), require cross-institution")
    args = ap.parse_args()

    n_in = 0
    n_out = 0
    n_multisite = 0
    n_transition = 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.leads.open() as fh, args.out.open("w") as out_fh:
        for line in fh:
            try:
                l = json.loads(line)
            except Exception:
                continue
            n_in += 1
            if l.get("jaccard", 0) < args.jac_min:
                continue
            if l.get("same_pi"):
                continue
            if not args.allow_same_org and l.get("same_org"):
                continue
            a_ac = (l.get("a_ac") or "")
            b_ac = (l.get("b_ac") or "")
            if not (a_ac.startswith(args.activity_prefix) and b_ac.startswith(args.activity_prefix)):
                continue
            if args.reject_multisite and (is_multisite(l.get("a_title")) or is_multisite(l.get("b_title"))):
                n_multisite += 1
                continue
            if is_within_org_transition(l):
                n_transition += 1
                continue
            out_fh.write(json.dumps(l) + "\n")
            n_out += 1
    summary = {
        "in": n_in,
        "out": n_out,
        "rejected_multisite": n_multisite,
        "rejected_transition": n_transition,
        "jac_min": args.jac_min,
        "activity_prefix": args.activity_prefix,
    }
    (args.out.parent / (args.out.stem + "_summary.json")).write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
