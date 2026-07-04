"""
Rumour + confirmed-integrity watchlist harvester.

Aggregates public sources that flag researchers or companies for integrity
concerns, from soft ("PubPeer thread") to hard ("NIH ORI finding"):

  1. NIH ORI Case Summaries — official research misconduct findings; DHHS Office
     of Research Integrity publishes them at
     https://ori.hhs.gov/case_summary
  2. PubPeer — crowd-sourced post-publication review; API returns flagged DOIs.
     https://pubpeer.com/search  (per-DOI query only; we sample via keywords)
  3. Retraction Watch top-10 retractors leaderboard — the highest-frequency
     retracting authors, published at retractionwatch.com/the-retraction-watch-leaderboard
  4. For Better Science flagged posts — Smut Clyde / Bik / Reddy blog, RSS.
  5. DOJ press releases for research-related FCA settlements — RSS filter.

Emits a JSON watchlist for downstream targeting: `people[]`, `orgs[]`, `dois[]`
each with source + confidence tier (hard / medium / soft).

Usage:
  python fetch_watchlist.py <out.json>
"""
from __future__ import annotations
import argparse, json, re, sys, time
from pathlib import Path
import urllib.parse
import urllib.request

UA = {"User-Agent": "sfh-extrapolator/1 (rupertwmurphy@gmail.com)"}


def get(url: str, timeout: int = 30, retries: int = 4) -> bytes | None:
    for a in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception:
            time.sleep(2 ** a)
    return None


def parse_ori_cases() -> list[dict]:
    """Scrape ORI case-summary index. Returns list of {name, org, year, url, source, tier}."""
    base = "https://ori.hhs.gov/case_summary"
    raw = get(base)
    if not raw:
        return []
    text = raw.decode("utf-8", "replace")
    entries = []
    # ORI index has entries like <a href="/content/name-firstlast">FirstLast, F.</a> — Institution.
    # Also older list pages linked from base.
    for m in re.finditer(
        r'<a[^>]+href="(/content/[^"]+)"[^>]*>([^<]+)</a>',
        text,
    ):
        href, name = m.group(1), m.group(2).strip()
        entries.append({
            "name": name,
            "url": "https://ori.hhs.gov" + href,
            "source": "NIH-ORI",
            "tier": "hard",
        })
    return entries


def parse_retraction_watch_leaderboard() -> list[dict]:
    """Fetch RW leaderboard names. Structure: static HTML table."""
    raw = get("https://retractionwatch.com/the-retraction-watch-leaderboard/")
    if not raw:
        return []
    text = raw.decode("utf-8", "replace")
    entries = []
    # Leaderboard rows: "Number of retractions. Name (affiliation)"
    for m in re.finditer(
        r"<li>\s*(\d+)\.\s*([^(<]+?)\s*\(([^)]+)\)",
        text,
    ):
        n, name, org = m.group(1), m.group(2).strip(), m.group(3).strip()
        entries.append({
            "name": name,
            "org": org,
            "n_retractions_reported": int(n),
            "source": "RetractionWatch-Leaderboard",
            "tier": "hard",
        })
    return entries


def pubpeer_flagged_sample(keywords: list[str]) -> list[dict]:
    """PubPeer's public search returns HTML; per keyword sample ~50 DOIs."""
    entries = []
    for kw in keywords:
        raw = get(f"https://pubpeer.com/search?q={urllib.parse.quote(kw)}")
        if not raw:
            continue
        text = raw.decode("utf-8", "replace")
        for m in re.finditer(r'href="/publications/([A-F0-9]{20,})"', text):
            entries.append({
                "pubpeer_hash": m.group(1),
                "source": f"PubPeer-search:{kw}",
                "tier": "soft",
            })
    # dedup
    seen = set()
    uniq = []
    for e in entries:
        h = e["pubpeer_hash"]
        if h in seen:
            continue
        seen.add(h)
        uniq.append(e)
    return uniq


def parse_for_better_science_rss() -> list[dict]:
    """Smut Clyde / Bik / For Better Science RSS — flagged papers/authors mentions."""
    raw = get("https://forbetterscience.com/feed/")
    if not raw:
        return []
    text = raw.decode("utf-8", "replace")
    entries = []
    for m in re.finditer(r"<title>([^<]{5,120})</title>\s*<link>([^<]+)</link>", text):
        title, link = m.group(1), m.group(2)
        if title.lower().startswith(("for better", "comments")):
            continue
        entries.append({
            "title": title,
            "url": link,
            "source": "ForBetterScience",
            "tier": "soft",
        })
    return entries[:100]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--pubpeer-keywords", default="fraud,duplicate,manipulation,misconduct")
    args = ap.parse_args()

    print("fetch NIH ORI cases", flush=True)
    ori = parse_ori_cases()
    print(f"  {len(ori)}", flush=True)

    print("fetch RW leaderboard", flush=True)
    rw = parse_retraction_watch_leaderboard()
    print(f"  {len(rw)}", flush=True)

    print("fetch For Better Science RSS", flush=True)
    fbs = parse_for_better_science_rss()
    print(f"  {len(fbs)}", flush=True)

    print("PubPeer keyword sample", flush=True)
    kws = [k.strip() for k in args.pubpeer_keywords.split(",") if k.strip()]
    pp = pubpeer_flagged_sample(kws)
    print(f"  {len(pp)}", flush=True)

    out = {
        "people": ori + rw,
        "posts": fbs,
        "pubpeer_hits": pp,
        "counts": {
            "nih_ori": len(ori),
            "rw_leaderboard": len(rw),
            "forbetterscience": len(fbs),
            "pubpeer": len(pp),
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2))
    print(json.dumps(out["counts"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
