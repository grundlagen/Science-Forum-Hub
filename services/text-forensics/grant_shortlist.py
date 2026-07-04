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

# Companion-award numeric-suffix pattern.
# NIH linked awards are given consecutive core project numbers within the same institute
# (e.g. R01AA020388 / R01AA020389). Extract the trailing numeric suffix and flag near-neighbours.
COREPAT = re.compile(r"^([A-Z]+[0-9]?)([A-Z]{2})([0-9]+)$")


def core_parts(core: str) -> tuple[str, str, int] | None:
    if not core:
        return None
    m = COREPAT.match(core.strip())
    if not m:
        return None
    return m.group(1), m.group(2), int(m.group(3))


def is_companion_pair(a_core: str, b_core: str) -> bool:
    a = core_parts(a_core)
    b = core_parts(b_core)
    if not a or not b:
        return False
    if a[0] != b[0] or a[1] != b[1]:
        return False
    return abs(a[2] - b[2]) <= 2


def strip_multisite_prefix(title: str) -> str:
    if not title:
        return ""
    return re.sub(r"^\s*\d\s*/\s*\d[-\s:]*", "", title, flags=re.IGNORECASE).lower().strip()


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
    ap.add_argument("--require-same-pi", action="store_true", default=False,
                    help="Grant-reuse premise: same PI text-reused across grants. Off by default because "
                         "PI-name normalisation is unreliable until entity-resolution lands.")
    ap.add_argument("--reject-companion-awards", action="store_true", default=True,
                    help="Drop pairs whose core-project numbers are consecutive (linked awards).")
    ap.add_argument("--reject-multisite-title-strip", action="store_true", default=True,
                    help="Drop pairs whose titles match after stripping 1/2, 2/2, etc. prefixes.")
    args = ap.parse_args()

    n_in = 0
    n_out = 0
    n_multisite = 0
    n_transition = 0
    n_companion = 0
    n_title_strip = 0
    n_dedup = 0
    n_same_pi_required = 0
    seen_pairs: set[tuple[str, str]] = set()
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
            # dedup by unordered core pair
            key = tuple(sorted([l.get("a_core") or "", l.get("b_core") or ""]))
            if key in seen_pairs:
                n_dedup += 1
                continue
            seen_pairs.add(key)
            # same-PI is the FCA premise; but the review notes PI-name-normalisation is unreliable,
            # so require_same_pi is opt-in. When on, use it.
            if args.require_same_pi:
                if not l.get("same_pi"):
                    n_same_pi_required += 1
                    continue
            else:
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
            if args.reject_companion_awards and is_companion_pair(l.get("a_core"), l.get("b_core")):
                n_companion += 1
                continue
            if args.reject_multisite_title_strip:
                if strip_multisite_prefix(l.get("a_title")) == strip_multisite_prefix(l.get("b_title")):
                    n_title_strip += 1
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
        "rejected_companion_awards": n_companion,
        "rejected_title_strip_match": n_title_strip,
        "rejected_transition": n_transition,
        "rejected_dedup_pair": n_dedup,
        "rejected_same_pi_gate": n_same_pi_required,
        "jac_min": args.jac_min,
        "activity_prefix": args.activity_prefix,
        "require_same_pi": args.require_same_pi,
    }
    (args.out.parent / (args.out.stem + "_summary.json")).write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
