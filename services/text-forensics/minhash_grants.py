"""
MinHash LSH near-duplicate scan over NIH RePORTER grant abstracts.

The FCA-relevant axis:
  1. Same PI applying multiple grants with near-identical abstract text
     (proposal recycling — sometimes legitimate re-application, sometimes
     double-billing signal when different funders / different topic claims).
  2. Different PIs with near-identical abstract text (shared/bought
     proposal writing; shell-PI / mentor-ghosting patterns).
  3. Same PI reusing proposal text across grants with disjoint award
     numbers and different scientific fields (activity_code / terms
     divergence).

Usage:
  python minhash_grants.py <grants.jsonl> <out.jsonl>
      [--threshold 0.7] [--num-perm 128] [--min-text 300] [--max 500000]
"""
from __future__ import annotations
import argparse, json, re, sys, time
from collections import defaultdict
from pathlib import Path


def shingles(text: str, k: int = 6) -> set[str]:
    text = re.sub(r"\s+", " ", (text or "").lower()).strip()
    toks = re.findall(r"[a-z0-9]+", text)
    if len(toks) < k:
        return set()
    return set(" ".join(toks[i:i+k]) for i in range(len(toks) - k + 1))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("grants", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--threshold", type=float, default=0.7)
    ap.add_argument("--num-perm", type=int, default=128)
    ap.add_argument("--min-text", type=int, default=300)
    ap.add_argument("--max", type=int, default=500_000)
    args = ap.parse_args()

    from datasketch import MinHash, MinHashLSH  # type: ignore

    lsh = MinHashLSH(threshold=args.threshold, num_perm=args.num_perm)
    idx: dict[str, dict] = {}
    minhashes: dict[str, "MinHash"] = {}
    text_cache: dict[str, str] = {}

    t0 = time.time()
    n = 0
    print("indexing grants", flush=True)
    with args.grants.open() as fh:
        for line in fh:
            try:
                r = json.loads(line)
            except Exception:
                continue
            text = (r.get("abstract") or "").strip()
            if len(text) < args.min_text:
                continue
            sh = shingles(text)
            if len(sh) < 20:
                continue
            # unique key per grant application
            key = f"{r.get('appl_id')}|{r.get('id')}"
            m = MinHash(num_perm=args.num_perm)
            for s in sh:
                m.update(s.encode())
            lsh.insert(key, m)
            minhashes[key] = m
            text_cache[key] = text[:600]
            idx[key] = {
                "appl_id": r.get("appl_id"),
                "core_project_num": r.get("id"),
                "title": r.get("title"),
                "fy": r.get("fy"),
                "amount": r.get("amount"),
                "activity_code": r.get("activity_code"),
                "org": r.get("org"),
                "pis": [p.get("name") for p in (r.get("pis") or []) if p.get("name")],
                "pi_ids": [p.get("profile_id") for p in (r.get("pis") or []) if p.get("profile_id")],
            }
            n += 1
            if n % 20000 == 0:
                print(f"indexed {n} grants ({n/(time.time()-t0):.0f}/s)", flush=True)
            if n >= args.max:
                break
    print(f"indexed {n} grants in {round(time.time()-t0,1)}s", flush=True)

    print("querying LSH", flush=True)
    t0 = time.time()
    n_hits = 0
    n_same_pi = 0
    n_cross_pi = 0
    seen = set()
    per_pi = defaultdict(int)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w") as out_fh:
        for i, (key, m) in enumerate(minhashes.items()):
            near = lsh.query(m)
            for nb in near:
                if nb == key:
                    continue
                pair = tuple(sorted([key, nb]))
                if pair in seen:
                    continue
                seen.add(pair)
                # exact jaccard
                sh_a = shingles(text_cache[key])
                sh_b = shingles(text_cache[nb])
                if not sh_a or not sh_b:
                    continue
                j = len(sh_a & sh_b) / len(sh_a | sh_b)
                if j < args.threshold:
                    continue
                a = idx[key]; b = idx[nb]
                pi_a = set(a["pis"] or [])
                pi_b = set(b["pis"] or [])
                pid_a = set(a["pi_ids"] or [])
                pid_b = set(b["pi_ids"] or [])
                same_pi = bool((pid_a and pid_b and (pid_a & pid_b)) or (pi_a and pi_b and (pi_a & pi_b)))
                same_org = a["org"] == b["org"]
                same_ac = a["activity_code"] == b["activity_code"]
                cross_agency = bool(a["activity_code"] and b["activity_code"] and a["activity_code"][:1] != b["activity_code"][:1])
                lead = {
                    "a_appl": a["appl_id"], "b_appl": b["appl_id"],
                    "a_core": a["core_project_num"], "b_core": b["core_project_num"],
                    "a_title": a["title"], "b_title": b["title"],
                    "a_fy": a["fy"], "b_fy": b["fy"],
                    "a_amount": a["amount"], "b_amount": b["amount"],
                    "a_ac": a["activity_code"], "b_ac": b["activity_code"],
                    "a_org": a["org"], "b_org": b["org"],
                    "a_pis": a["pis"], "b_pis": b["pis"],
                    "jaccard": round(j, 4),
                    "same_pi": same_pi,
                    "same_org": same_org,
                    "same_activity_code": same_ac,
                    "cross_activity_type": cross_agency,
                }
                out_fh.write(json.dumps(lead) + "\n")
                n_hits += 1
                if same_pi:
                    n_same_pi += 1
                    for p in (pi_a | pi_b):
                        per_pi[p] += 1
                else:
                    n_cross_pi += 1
            if (i + 1) % 20000 == 0:
                print(f"queried {i+1}/{n}  hits={n_hits}", flush=True)

    top_pi = sorted(per_pi.items(), key=lambda x: -x[1])[:100]
    summary = {
        "indexed": n,
        "hits": n_hits,
        "same_pi_hits": n_same_pi,
        "cross_pi_hits": n_cross_pi,
        "top_pi_recycler_count": top_pi[:50],
        "threshold": args.threshold,
        "seconds": round(time.time() - t0, 1),
    }
    (args.out.parent / (args.out.stem + "_summary.json")).write_text(json.dumps(summary, indent=2))
    print(json.dumps({k: v for k, v in summary.items() if k != "top_pi_recycler_count"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
