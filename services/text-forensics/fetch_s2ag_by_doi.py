"""
S2AG paper-batch fetcher — pull SPECTER2 embeddings + tortured-phrase flags
+ citation metadata for a set of DOIs / PMIDs we already have.

S2 public rate limit is 1000 req/s (per second, not per day). No API key needed
for graph endpoints below 100 req/s throughput.

Input: JSONL with either `doi` or `pmid` field per record (our works.jsonl /
passages.jsonl / grants.jsonl format).

Output: JSONL of S2 records — paperId, corpusId, externalIds, references count,
citation count, SPECTER2 embedding vector (if requested), tldr, publicationVenue.

Usage:
  python fetch_s2ag_by_doi.py <in.jsonl> <out.jsonl> \
      [--batch 500] [--rate 1.5] [--field-set default|embed]
"""
from __future__ import annotations
import argparse, json, os, sys, time
import urllib.parse, urllib.request
from pathlib import Path

GRAPH = "https://api.semanticscholar.org/graph/v1/paper/batch"

FIELDS_DEFAULT = "paperId,corpusId,externalIds,title,year,referenceCount,citationCount,influentialCitationCount,tldr,publicationVenue,openAccessPdf,fieldsOfStudy"
FIELDS_EMBED = FIELDS_DEFAULT + ",embedding.specter_v2"


def headers():
    h = {"content-type": "application/json", "user-agent": "sfh-extrapolator/1"}
    if os.environ.get("SEMANTIC_SCHOLAR_API_KEY"):
        h["x-api-key"] = os.environ["SEMANTIC_SCHOLAR_API_KEY"]
    return h


def post_batch(ids: list[str], fields: str, retries: int = 6):
    body = json.dumps({"ids": ids}).encode()
    url = f"{GRAPH}?fields={urllib.parse.quote(fields)}"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=body, headers=headers())
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(30 * (2 ** attempt))
            elif e.code == 400:
                # bad IDs in batch — split
                if len(ids) > 1:
                    mid = len(ids) // 2
                    a = post_batch(ids[:mid], fields, retries=retries - 1)
                    b = post_batch(ids[mid:], fields, retries=retries - 1)
                    return (a or []) + (b or [])
                return [None]
            else:
                time.sleep(2 ** attempt)
        except Exception:
            time.sleep(2 ** attempt)
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("in_path", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--batch", type=int, default=500)
    ap.add_argument("--rate", type=float, default=1.2, help="Sleep seconds between batches")
    ap.add_argument("--field-set", choices=["default", "embed"], default="default")
    ap.add_argument("--id-field", default="pmid", choices=["doi", "pmid"])
    args = ap.parse_args()

    fields = FIELDS_EMBED if args.field_set == "embed" else FIELDS_DEFAULT
    args.out.parent.mkdir(parents=True, exist_ok=True)
    # resume
    done: set[str] = set()
    if args.out.exists():
        with args.out.open() as fh:
            for line in fh:
                try:
                    r = json.loads(line)
                    for k in ("DOI", "PubMed", "PubMedCentral"):
                        v = ((r.get("externalIds") or {}).get(k) or "").lower()
                        if v:
                            done.add(v)
                except Exception:
                    pass
        print(f"resume: {len(done)} paper IDs already in output", flush=True)

    ids_batch: list[str] = []
    n_in = 0
    n_out = 0
    n_err = 0
    t0 = time.time()
    with args.in_path.open() as fh, args.out.open("a") as out_fh:
        def flush():
            nonlocal n_out, n_err
            if not ids_batch:
                return
            resp = post_batch(ids_batch, fields)
            if resp is None:
                n_err += len(ids_batch)
                ids_batch.clear()
                return
            for rec in resp:
                if rec is None:
                    n_err += 1
                    continue
                out_fh.write(json.dumps(rec) + "\n")
                n_out += 1
            ids_batch.clear()
            out_fh.flush()

        for line in fh:
            try:
                r = json.loads(line)
            except Exception:
                continue
            n_in += 1
            if args.id_field == "doi":
                v = (r.get("doi") or "").lower().lstrip("https://doi.org/")
                if not v:
                    continue
                if v in done:
                    continue
                done.add(v)
                ids_batch.append(f"DOI:{v}")
            else:
                v = r.get("pmid") or ""
                if not v:
                    continue
                if v in done:
                    continue
                done.add(v)
                ids_batch.append(f"PMID:{v}")
            if len(ids_batch) >= args.batch:
                flush()
                time.sleep(args.rate)
                if n_out % (args.batch * 10) == 0:
                    rate = n_out / max(1e-3, time.time() - t0)
                    print(f"in={n_in} out={n_out} err={n_err} ({rate:.0f}/s)", flush=True)
        flush()

    print(json.dumps({"scanned": n_in, "written": n_out, "errors": n_err,
                      "seconds": round(time.time() - t0, 1)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
