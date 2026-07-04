"""
NIH RePORTER — download every project record with an abstract, streaming to JSONL.

RePORTER `POST /projects/search` is the bulk endpoint. Rate limit ~1 req/s.
Full corpus is ~1M projects; a full pull is ~1-2h.

Emits: id (core_project_num), abstract, project_terms, pi_names, org_name, fy,
        award_amount, activity_code, application_id, project_title.

Usage:
  python fetch_reporter.py <out.jsonl> [--from-fy 2015] [--limit N] [--per-page 500]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

URL = "https://api.reporter.nih.gov/v2/projects/search"


def http_post_json(url: str, body: dict, retries: int = 6) -> dict:
    payload = json.dumps(body).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                data=payload,
                headers={"content-type": "application/json", "user-agent": "sfh-extrapolator/1"},
            )
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001
            time.sleep(2 ** attempt)
            last = e
    raise RuntimeError(f"reporter POST failed: {last}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--from-fy", type=int, default=2015)
    ap.add_argument("--to-fy", type=int, default=2025)
    ap.add_argument("--limit", type=int, default=1_000_000)
    ap.add_argument("--per-page", type=int, default=500)
    args = ap.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    t0 = time.time()
    with args.out.open("w") as fh:
        for fy in range(args.from_fy, args.to_fy + 1):
            offset = 0
            while n < args.limit:
                body = {
                    "criteria": {"fiscal_years": [fy]},
                    "include_fields": [
                        "ApplId",
                        "CoreProjectNum",
                        "ProjectTitle",
                        "Abstract",
                        "AbstractText",
                        "ProjectTerms",
                        "PrincipalInvestigators",
                        "Organization",
                        "FiscalYear",
                        "AwardAmount",
                        "ActivityCode",
                    ],
                    "offset": offset,
                    "limit": args.per_page,
                    "sort_field": "core_project_num",
                }
                try:
                    data = http_post_json(URL, body)
                except Exception as e:
                    print(f"fy={fy} offset={offset} error {e}", file=sys.stderr, flush=True)
                    time.sleep(5)
                    break
                results = data.get("results") or []
                if not results:
                    break
                for r in results:
                    abs_txt = r.get("abstract_text") or r.get("Abstract") or ""
                    if not abs_txt or len(abs_txt) < 100:
                        continue
                    rec = {
                        "id": r.get("core_project_num") or r.get("appl_id"),
                        "appl_id": r.get("appl_id"),
                        "title": r.get("project_title"),
                        "abstract": abs_txt,
                        "fy": r.get("fiscal_year"),
                        "amount": r.get("award_amount"),
                        "activity_code": r.get("activity_code"),
                        "org": (r.get("organization") or {}).get("org_name"),
                        "pis": [
                            {"name": p.get("full_name"), "profile_id": p.get("profile_id")}
                            for p in (r.get("principal_investigators") or [])
                        ],
                        "terms": r.get("project_terms"),
                    }
                    fh.write(json.dumps(rec) + "\n")
                    n += 1
                    if n >= args.limit:
                        break
                offset += len(results)
                if n % 2000 == 0:
                    rate = n / max(1e-3, time.time() - t0)
                    print(f"fy={fy} n={n} ({rate:.0f}/s)", file=sys.stderr, flush=True)
                if len(results) < args.per_page:
                    break
    print(json.dumps({"fetched": n, "out": str(args.out), "seconds": round(time.time()-t0,1)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
