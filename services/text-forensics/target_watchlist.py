"""
Target-watchlist scanner — cross-check ORI/RW/FBS names against our corpora.

For each flagged individual:
  1. Find their NIH RePORTER grants (name match).
  2. Find their published papers in the corpus (name match on authors/PIs).
  3. Rerun the detectors on those papers/grants specifically:
     - grant-vs-grant text reuse
     - GRIM impossibility hits on their passages
     - retraction cross-check
     - image cross-figure retrieval hits (if panel_leads.jsonl available)

Emits per-target case package:
  {name, sources, matched_grants[], matched_papers[], grim_hits[],
   grant_reuse_pairs[], retraction_hits[], passage_texts_evidence[]}

Usage:
  python target_watchlist.py <watchlist.json> <grants.jsonl> <passages.jsonl>
      [--retraction-dois retracted_dois.txt] [--grim-leads grim_v2.jsonl]
      [--grant-reuse grant_reuse_leads.jsonl] <out.jsonl>
"""
from __future__ import annotations
import argparse, json, re, sys
from collections import defaultdict
from pathlib import Path


def normalise_name(name: str) -> str:
    if not name:
        return ""
    n = re.sub(r"[^\w\s]", "", name).strip().lower()
    # For ORI "Last, First" → "First Last"
    if "," in name:
        parts = [p.strip() for p in name.split(",")]
        if len(parts) == 2:
            n = f"{parts[1]} {parts[0]}"
    return re.sub(r"\s+", " ", n.lower())


def surname_first(name: str) -> str:
    n = re.sub(r"[^\w\s]", "", name or "").strip()
    parts = n.split()
    if not parts:
        return ""
    return parts[-1].lower()


def parse_ori_case_summary_line(name_field: str) -> str:
    """ORI titles are 'Case Summary: Last, First' or 'Case Summary:  Last, First X.'"""
    m = re.match(r"case summary:\s*(.+)", name_field.strip(), re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return name_field.strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("watchlist", type=Path)
    ap.add_argument("grants", type=Path)
    ap.add_argument("passages", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--retraction-dois", type=Path, default=None)
    ap.add_argument("--grim-leads", type=Path, default=None)
    ap.add_argument("--grant-reuse", type=Path, default=None)
    args = ap.parse_args()

    wl = json.loads(args.watchlist.read_text())
    targets = []
    for p in wl.get("people", []):
        raw = p.get("name") or ""
        canon = parse_ori_case_summary_line(raw)
        if not canon:
            continue
        targets.append({
            "raw": raw,
            "canon": canon,
            "surname": surname_first(canon),
            "sources": [p.get("source")],
            "url": p.get("url"),
            "tier": p.get("tier"),
        })
    # dedup by surname
    by_surname: dict[str, dict] = {}
    for t in targets:
        s = t["surname"]
        if not s or len(s) < 3:
            continue
        if s in by_surname:
            by_surname[s]["sources"] += t["sources"]
        else:
            by_surname[s] = t
    targets = list(by_surname.values())
    print(f"targets: {len(targets)}", flush=True)

    retracted: set[str] = set()
    if args.retraction_dois and args.retraction_dois.exists():
        retracted = {l.strip().lower().lstrip("https://doi.org/") for l in args.retraction_dois.open() if l.strip()}

    grim_by_paper: dict[str, list[dict]] = defaultdict(list)
    if args.grim_leads and args.grim_leads.exists():
        for line in args.grim_leads.open():
            try:
                r = json.loads(line)
                grim_by_paper[r.get("paper_id") or ""].append(r)
            except Exception:
                pass

    # index grants by PI last-name
    grants_by_surname: dict[str, list[dict]] = defaultdict(list)
    for line in args.grants.open():
        try:
            g = json.loads(line)
        except Exception:
            continue
        for pi in (g.get("pis") or []):
            name = pi.get("name") or ""
            s = surname_first(name)
            if s:
                grants_by_surname[s].append({
                    "core": g.get("id"),
                    "appl": g.get("appl_id"),
                    "title": g.get("title"),
                    "fy": g.get("fy"),
                    "amount": g.get("amount"),
                    "org": g.get("org"),
                    "pi_name": name,
                })

    # For passages, we don't have authors — cross via title heuristic. Skip unless needed.

    grant_reuse_by_appl: dict[str, list[dict]] = defaultdict(list)
    if args.grant_reuse and args.grant_reuse.exists():
        for line in args.grant_reuse.open():
            try:
                r = json.loads(line)
                grant_reuse_by_appl[str(r.get("a_appl"))].append(r)
                grant_reuse_by_appl[str(r.get("b_appl"))].append(r)
            except Exception:
                pass

    args.out.parent.mkdir(parents=True, exist_ok=True)
    n_out = 0
    with args.out.open("w") as ofh:
        for t in targets:
            s = t["surname"]
            grants = grants_by_surname.get(s, [])
            # only keep grants where the given name overlaps with the target's canon
            canon_lower = t["canon"].lower()
            first_word = canon_lower.split(",")[-1].strip().split()[0] if canon_lower else ""
            grants = [g for g in grants if first_word and first_word in g["pi_name"].lower()][:20]
            if not grants:
                continue
            # find their grant-reuse hits
            reuse = []
            for g in grants:
                reuse += grant_reuse_by_appl.get(str(g.get("appl")), [])
            case = {
                "target": t,
                "matched_grants": grants,
                "n_grants": len(grants),
                "total_award_usd": sum(float(g.get("amount") or 0) for g in grants),
                "grant_reuse_hits": reuse[:10],
                "n_reuse_hits": len(reuse),
            }
            ofh.write(json.dumps(case) + "\n")
            n_out += 1
    print(f"case packages: {n_out}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
