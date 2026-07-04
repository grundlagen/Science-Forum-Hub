"""
Retraction Watch DOI list — public via Crossref labs.

Crossref hosts the Retraction Watch DB under license; querying with a `mailto`
returns the CSV. Writes one DOI per line (lower-cased, https-stripped).

    python fetch_retractions.py <out_dois.txt>
"""
from __future__ import annotations

import argparse
import csv
import io
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

URL = "https://api.labs.crossref.org/data/retractionwatch"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    args = ap.parse_args()
    mailto = os.environ.get("OPENALEX_MAILTO", "rupertwmurphy@gmail.com")
    url = f"{URL}?{urllib.parse.urlencode({'mailto': mailto})}"
    print(f"fetching {url}", flush=True)
    t0 = time.time()
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read().decode("utf-8", errors="replace")
    print(f"  {len(data)/1e6:.1f} MB in {round(time.time()-t0,1)}s", flush=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    seen = set()
    reader = csv.DictReader(io.StringIO(data))
    with args.out.open("w") as fh:
        for row in reader:
            for key in ("OriginalPaperDOI", "RetractionDOI", "DOI"):
                doi = (row.get(key) or "").strip().lower().lstrip("https://doi.org/")
                if doi and doi not in seen:
                    seen.add(doi)
                    fh.write(doi + "\n")
                    n += 1
    print(f"wrote {n} DOIs -> {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
