"""
Stream NIH-funded works from OpenAlex — free, no auth, polite pool via mailto.

Emits one JSONL line per work with the fields we need for near-dup + award-crossover
scoring: id, doi, pmid, title, abstract (reconstructed from OpenAlex's inverted index),
publication_year, authorships (id + name), grants (funder + award_id).

Usage:
  python fetch_openalex_nih.py <out.jsonl> [--limit N] [--per-page 200]

OpenAlex NIH funder id: F4320337354 (https://api.openalex.org/funders/F4320337354).
Cursor pagination is unbounded; limit if you want a smoke run.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://api.openalex.org/works"
NIH_FUNDER_ID = "F4320337354"
# US federal-funder OpenAlex IDs (multi-funder scan). NIH+NSF+DoE+DoD+NASA+USDA+VA+CDC.
US_FEDERAL_FUNDERS = [
    "F4320337354",  # NIH
    "F4320306076",  # NSF
    "F4320337395",  # DoE
    "F4320337394",  # DoD
    "F4320306084",  # NASA
    "F4320306138",  # USDA
    "F4320306106",  # CDC
]


def reconstruct_abstract(inv: dict | None) -> str | None:
    if not inv:
        return None
    positions: list[tuple[int, str]] = []
    for word, ixs in inv.items():
        for i in ixs:
            positions.append((i, word))
    positions.sort()
    return " ".join(w for _, w in positions) if positions else None


def pmid_from_ids(ids: dict | None) -> str | None:
    if not ids:
        return None
    pmid = ids.get("pmid")
    if not pmid:
        return None
    return pmid.rsplit("/", 1)[-1] if "/" in pmid else pmid


def http_json(url: str, retries: int = 10) -> dict:
    err: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "sfh-extrapolator/1"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:  # type: ignore[name-defined]
            # Honour 429 Retry-After when provided; else slow-start backoff (30/60/120/240s).
            if e.code == 429:
                ra = e.headers.get("Retry-After") if hasattr(e, "headers") else None
                wait = int(ra) if (ra and ra.isdigit()) else min(300, 30 * (2 ** attempt))
                print(f"openalex 429; sleep {wait}s", file=sys.stderr, flush=True)
                time.sleep(wait)
                err = e
                continue
            err = e
            time.sleep(2 ** attempt)
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"openalex fetch failed: {url}") from err


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--limit", type=int, default=50000)
    ap.add_argument("--per-page", type=int, default=200)
    ap.add_argument("--from-year", type=int, default=2015)
    ap.add_argument("--funders", default=NIH_FUNDER_ID,
                    help="Comma-separated OpenAlex funder IDs; use 'us-federal' for the full US-federal set.")
    args = ap.parse_args()

    mailto = os.environ.get("OPENALEX_MAILTO", "rupertwmurphy@gmail.com")
    api_key = os.environ.get("OPENALEX_API_KEY", "")
    if args.funders == "us-federal":
        funder_ids = US_FEDERAL_FUNDERS
    else:
        funder_ids = [f.strip() for f in args.funders.split(",") if f.strip()]
    funder_expr = "|".join(funder_ids)
    filt = f"awards.funder_id:{funder_expr},from_publication_date:{args.from_year}-01-01,has_abstract:true"
    cursor = "*"

    args.out.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    resume_ids: set[str] = set()
    if args.out.exists() and args.out.stat().st_size > 0:
        with args.out.open() as fh:
            for line in fh:
                try:
                    resume_ids.add(json.loads(line).get("id") or "")
                    n += 1
                except Exception:
                    pass
        print(f"resume: {n} already fetched, appending", file=sys.stderr, flush=True)
    t0 = time.time()
    with args.out.open("a") as fh:
        while cursor and n < args.limit:
            qs = urllib.parse.urlencode({
                "filter": filt,
                "per-page": args.per_page,
                "cursor": cursor,
                "mailto": mailto,
                "select": "id,doi,ids,title,abstract_inverted_index,publication_year,authorships,awards",
                **({"api_key": api_key} if api_key else {}),
            })
            data = http_json(f"{BASE}?{qs}")
            results = data.get("results", []) or []
            if not results:
                break
            time.sleep(0.15)  # ~7 req/s max; polite pool tolerates ~10
            for w in results:
                if w.get("id") in resume_ids:
                    continue
                abstract = reconstruct_abstract(w.get("abstract_inverted_index"))
                if not abstract:
                    continue
                rec = {
                    "id": w.get("id"),
                    "doi": w.get("doi"),
                    "pmid": pmid_from_ids(w.get("ids")),
                    "title": w.get("title"),
                    "abstract": abstract,
                    "year": w.get("publication_year"),
                    "authors": [
                        {
                            "id": a.get("author", {}).get("id"),
                            "name": a.get("author", {}).get("display_name"),
                        }
                        for a in (w.get("authorships") or [])
                    ],
                    "grants": [
                        {
                            "funder": g.get("funder_id"),
                            "funder_name": g.get("funder_display_name"),
                            "award_id": g.get("funder_award_id"),
                        }
                        for g in (w.get("awards") or [])
                        if (g.get("funder_id") or "").rsplit("/", 1)[-1] in funder_ids
                    ],
                }
                fh.write(json.dumps(rec) + "\n")
                n += 1
                if n >= args.limit:
                    break
            cursor = data.get("meta", {}).get("next_cursor")
            if n % 1000 == 0 or not cursor:
                rate = n / max(1e-3, time.time() - t0)
                print(f"fetched {n}  ({rate:.0f}/s)", file=sys.stderr, flush=True)
    print(json.dumps({"fetched": n, "out": str(args.out), "seconds": round(time.time()-t0, 1)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
