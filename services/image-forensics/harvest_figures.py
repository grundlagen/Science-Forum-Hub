"""
Open-access figure harvester -> panel index builder.

This is the data half of the ImageTwin gap: their moat is a ~150M-figure corpus,
which is built exactly like this, just bigger. Europe PMC exposes supplementary
files and full-text (including figures) for the open-access subset through a public
REST API — no key needed. Run on a machine with normal network access:

  python harvest_figures.py 'AUTH:"Some Author"' ./corpus 200
  python harvest_figures.py 'GRANT_AGENCY:"NIH" AND OPEN_ACCESS:y' ./corpus 5000
  python embedding_index.py build ./corpus ./corpus_index
  python embedding_index.py query ./corpus_index suspect_panel.png

Be a polite client: the loop sleeps between requests and retries on 5xx. Respect
the OA licence terms of each article (figures are indexed for analysis, not
republished).
"""
from __future__ import annotations

import io
import json
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

EUROPEPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest"
SLEEP_S = 0.4
RETRIES = 4
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".gif"}


def _get(url: str) -> bytes:
    last: Exception | None = None
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 — retry any transient failure
            last = e
            time.sleep(2**attempt)
    raise RuntimeError(f"failed after {RETRIES} tries: {url}") from last


def search_pmcids(query: str, limit: int) -> list[str]:
    """Open-access PMCIDs matching an Europe PMC query."""
    pmcids: list[str] = []
    cursor = "*"
    while len(pmcids) < limit:
        q = urllib.parse.quote(f"({query}) AND OPEN_ACCESS:y")
        url = (
            f"{EUROPEPMC}/search?query={q}&format=json&pageSize=100"
            f"&cursorMark={urllib.parse.quote(cursor)}"
        )
        data = json.loads(_get(url))
        hits = data.get("resultList", {}).get("result", [])
        if not hits:
            break
        for h in hits:
            pmcid = h.get("pmcid")
            if pmcid:
                pmcids.append(pmcid)
        nxt = data.get("nextCursorMark")
        if not nxt or nxt == cursor:
            break
        cursor = nxt
        time.sleep(SLEEP_S)
    return pmcids[:limit]


def fetch_figures(pmcid: str, out_dir: Path) -> int:
    """Download an article's supplementary/figure files; returns images written."""
    url = f"{EUROPEPMC}/{pmcid}/supplementaryFiles"
    try:
        blob = _get(url)
    except RuntimeError:
        return 0
    wrote = 0
    dest = out_dir / pmcid
    try:
        with zipfile.ZipFile(io.BytesIO(blob)) as z:
            for name in z.namelist():
                if Path(name).suffix.lower() in IMAGE_EXTS:
                    dest.mkdir(parents=True, exist_ok=True)
                    (dest / Path(name).name).write_bytes(z.read(name))
                    wrote += 1
    except zipfile.BadZipFile:
        return 0
    return wrote


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: python harvest_figures.py '<europepmc query>' <out_dir> [max_articles]")
        return 1
    query = sys.argv[1]
    out_dir = Path(sys.argv[2])
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else 100
    out_dir.mkdir(parents=True, exist_ok=True)

    pmcids = search_pmcids(query, limit)
    print(f"{len(pmcids)} open-access article(s) for: {query}")
    total = 0
    for i, pmcid in enumerate(pmcids, 1):
        n = fetch_figures(pmcid, out_dir)
        total += n
        if n:
            print(f"  [{i}/{len(pmcids)}] {pmcid}: {n} image(s)")
        time.sleep(SLEEP_S)
    print(f"done: {total} image(s) under {out_dir}")
    print(f"next: python embedding_index.py build {out_dir} {out_dir}_index")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
