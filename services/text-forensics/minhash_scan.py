"""
MinHash LSH near-duplicate scan over passage jsonl.

Deterministic character-6-gram MinHash + LSH. Catches actual copy-paste text
reuse across papers without the "all methods paragraphs look alike" collapse
that afflicts SPECTER2 at passage level.

Threshold ~0.7 Jaccard is the classic plagiarism-detection band.

Usage:
  python minhash_scan.py <passages.jsonl> <works.jsonl> <out_leads.jsonl> \
      [--threshold 0.7] [--num-perm 128] [--min-text 300] [--max 500000]
"""
from __future__ import annotations
import argparse, json, re, sys, time
from pathlib import Path


def shingles(text: str, k: int = 6) -> set[str]:
    """Word 6-shingles (deterministic tokenization). Sets are cheap to hash."""
    text = re.sub(r"\s+", " ", (text or "").lower()).strip()
    toks = re.findall(r"[a-z0-9]+", text)
    if len(toks) < k:
        return set()
    return set(" ".join(toks[i:i+k]) for i in range(len(toks) - k + 1))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("passages", type=Path)
    ap.add_argument("works", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--threshold", type=float, default=0.7)
    ap.add_argument("--num-perm", type=int, default=128)
    ap.add_argument("--min-text", type=int, default=300)
    ap.add_argument("--max", type=int, default=500_000)
    ap.add_argument("--sections", default="METHOD,RESULT,DISCUS,INTRO",
                    help="Comma-separated section prefixes to keep. Empty=all.")
    args = ap.parse_args()

    from datasketch import MinHash, MinHashLSH  # type: ignore

    print(f"loading works meta {args.works}", flush=True)
    works: dict = {}
    with args.works.open() as fh:
        for line in fh:
            try:
                r = json.loads(line); works[r["id"]] = r
            except Exception:
                pass
    print(f"  {len(works)} papers", flush=True)

    keep_sec = tuple(s.strip().upper() for s in args.sections.split(",") if s.strip())
    lsh = MinHashLSH(threshold=args.threshold, num_perm=args.num_perm)
    key_to_paper: dict[str, str] = {}
    key_to_sec: dict[str, str] = {}
    key_to_text: dict[str, str] = {}
    minhashes: dict[str, MinHash] = {}

    print(f"scanning passages", flush=True)
    t0 = time.time()
    n = 0
    with args.passages.open() as fh:
        for line in fh:
            try:
                r = json.loads(line)
            except Exception:
                continue
            sec = (r.get("section") or "").upper()
            if keep_sec and not any(sec.startswith(p) for p in keep_sec):
                continue
            text = (r.get("text") or "").strip()
            if len(text) < args.min_text:
                continue
            sh = shingles(text)
            if len(sh) < 20:
                continue
            key = f"{r.get('paper_id')}#{r.get('section')}#{r.get('passage_ix')}"
            m = MinHash(num_perm=args.num_perm)
            for s in sh:
                m.update(s.encode())
            lsh.insert(key, m)
            minhashes[key] = m
            key_to_paper[key] = r.get("paper_id") or ""
            key_to_sec[key] = r.get("section") or ""
            key_to_text[key] = text[:2000]
            n += 1
            if n % 20000 == 0:
                print(f"indexed {n} passages ({n/(time.time()-t0):.0f}/s)", flush=True)
            if n >= args.max:
                break
    print(f"indexed {n} passages in {round(time.time()-t0,1)}s", flush=True)

    print("querying LSH for near-duplicates", flush=True)
    t0 = time.time()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    n_hits = 0
    seen = set()
    with args.out.open("w") as out_fh:
        for i, (key, m) in enumerate(minhashes.items()):
            near = lsh.query(m)
            for nb_key in near:
                if nb_key == key:
                    continue
                pair = tuple(sorted([key, nb_key]))
                if pair in seen:
                    continue
                seen.add(pair)
                a_paper = key_to_paper[key]
                b_paper = key_to_paper[nb_key]
                if a_paper == b_paper:
                    continue  # skip within-paper
                # exact Jaccard on shingles for precision
                sh_a = shingles(key_to_text[key])
                sh_b = shingles(key_to_text[nb_key])
                if not sh_a or not sh_b:
                    continue
                j = len(sh_a & sh_b) / len(sh_a | sh_b)
                if j < args.threshold:
                    continue
                ra = works.get(a_paper, {}) or {}
                rb = works.get(b_paper, {}) or {}
                aa = {(a.get("id") or a.get("name")) for a in (ra.get("authors") or [])}
                bb = {(a.get("id") or a.get("name")) for a in (rb.get("authors") or [])}
                aw_a = {g.get("award_id") for g in (ra.get("grants") or []) if g.get("award_id")}
                aw_b = {g.get("award_id") for g in (rb.get("grants") or []) if g.get("award_id")}
                lead = {
                    "a_paper": a_paper, "a_sec": key_to_sec[key],
                    "b_paper": b_paper, "b_sec": key_to_sec[nb_key],
                    "jaccard": round(j, 4),
                    "cross_author": not bool(aa and bb and (aa & bb)),
                    "cross_award": bool(aw_a and aw_b and not (aw_a & aw_b)),
                    "a_title": ra.get("title"), "b_title": rb.get("title"),
                    "a_doi": ra.get("doi"), "b_doi": rb.get("doi"),
                    "a_awards": sorted(aw_a)[:5], "b_awards": sorted(aw_b)[:5],
                    "a_text": key_to_text[key][:400],
                    "b_text": key_to_text[nb_key][:400],
                }
                out_fh.write(json.dumps(lead) + "\n")
                n_hits += 1
            if (i+1) % 20000 == 0:
                print(f"queried {i+1}/{n}  hits={n_hits}", flush=True)
    print(json.dumps({
        "indexed": n, "cross_paper_hits": n_hits,
        "threshold": args.threshold, "seconds": round(time.time()-t0,1)
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
