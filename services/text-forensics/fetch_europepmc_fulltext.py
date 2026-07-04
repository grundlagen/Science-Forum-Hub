"""
Europe PMC BioC XML full-text fetcher.

Section-labelled passages for the OA subset. Passages come with section names
(INTRO, METHODS, RESULTS, DISCUS, TITLE, ABSTRACT, ...) so we can embed each
section independently and target the FCA-relevant sections (METHODS for tech
reuse, INTRO for boilerplate motivation, RESULTS for outcome-claim reuse).

Input: JSONL of {id, doi, pmid, ...} (our fetch_openalex_nih.py output).
Output: JSONL of {paper_id, pmcid, section, passage_ix, text} per passage.

Usage:
  python fetch_europepmc_fulltext.py <works.jsonl> <out_passages.jsonl> [--max N] [--concurrency 6]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from xml.etree import ElementTree as ET

EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest"


def get(url: str, retries: int = 4) -> bytes | None:
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=45) as r:
                return r.read()
        except Exception:
            time.sleep(2 ** attempt)
    return None


def pmcid_for_pmid(pmid: str) -> str | None:
    if not pmid:
        return None
    url = f"{EPMC}/search?query=EXT_ID:{pmid}%20AND%20SRC:MED%20AND%20OPEN_ACCESS:y&format=json&pageSize=1"
    data = get(url)
    if not data:
        return None
    try:
        j = json.loads(data)
        hits = (j.get("resultList") or {}).get("result") or []
        if not hits:
            return None
        return hits[0].get("pmcid")
    except Exception:
        return None


def fetch_passages(pmcid: str) -> list[tuple[str, int, str]]:
    """Return list of (section, passage_ix, text) for a PMCID via BioC XML."""
    url = f"{EPMC}/{pmcid}/fullTextXML"
    raw = get(url)
    if not raw:
        return []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []
    out: list[tuple[str, int, str]] = []
    # BioC or JATS. Try JATS first: sec/title + p; then fallback to BioC passage nodes.
    ns = {"": ""}
    ix = 0
    # JATS pattern
    for sec in root.iter("sec"):
        title_el = sec.find("title")
        section = "SEC"
        if title_el is not None and title_el.text:
            t = re.sub(r"\W+", "", title_el.text.lower())[:12].upper()
            if t:
                section = t
        for p in sec.iter("p"):
            text = " ".join((p.itertext() or []))
            text = re.sub(r"\s+", " ", text).strip()
            if len(text) < 40:
                continue
            out.append((section, ix, text))
            ix += 1
    if out:
        return out
    # BioC fallback
    for passage in root.iter("passage"):
        section = "SEC"
        for info in passage.findall("infon"):
            if info.get("key") in ("section_type", "type"):
                section = (info.text or "SEC").upper()[:12]
        text_el = passage.find("text")
        if text_el is None or not text_el.text:
            continue
        t = re.sub(r"\s+", " ", text_el.text).strip()
        if len(t) < 40:
            continue
        out.append((section, ix, t))
        ix += 1
    return out


def process_record(rec: dict) -> list[dict]:
    pmid = rec.get("pmid")
    pmcid = pmcid_for_pmid(pmid)
    if not pmcid:
        return []
    passages = fetch_passages(pmcid)
    return [
        {"paper_id": rec.get("id"), "pmid": pmid, "pmcid": pmcid, "section": s, "passage_ix": ix, "text": t}
        for (s, ix, t) in passages
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("works", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--max", type=int, default=200000)
    ap.add_argument("--concurrency", type=int, default=6)
    args = ap.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    # Resume: skip papers already in the output
    done: set[str] = set()
    if args.out.exists():
        with args.out.open() as fh:
            for line in fh:
                try:
                    r = json.loads(line)
                    done.add(r.get("paper_id") or "")
                except Exception:
                    pass
        print(f"resume: {len(done)} papers already processed", flush=True)

    todo: list[dict] = []
    with args.works.open() as fh:
        for line in fh:
            try:
                r = json.loads(line)
            except Exception:
                continue
            if not r.get("pmid"):
                continue
            if r.get("id") in done:
                continue
            todo.append(r)
            if len(todo) >= args.max:
                break
    print(f"todo: {len(todo)} papers", flush=True)

    n_passages = 0
    n_hits = 0
    t0 = time.time()
    out_fh = args.out.open("a")
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = {pool.submit(process_record, r): r for r in todo}
        for i, fut in enumerate(as_completed(futures), 1):
            try:
                items = fut.result()
            except Exception:
                items = []
            if items:
                n_hits += 1
                for it in items:
                    out_fh.write(json.dumps(it) + "\n")
                    n_passages += 1
                out_fh.flush()
            if i % 200 == 0:
                rate = i / max(1e-3, time.time() - t0)
                print(f"processed {i}/{len(todo)}  hits={n_hits}  passages={n_passages}  ({rate:.1f}/s)", flush=True)
    out_fh.close()
    print(json.dumps({"processed": len(todo), "papers_with_fulltext": n_hits, "passages": n_passages, "seconds": round(time.time()-t0,1)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
