"""
Enrich ORI case summaries with institution + findings extracted from each case page.

Fixes the name-collision problem: "Daniel Andrade" matches 20 grants across
Stanford/Mt Sinai/Vanderbilt/Tulane because different real people share the name.
The ORI page for each case names the specific respondent's institution + specialty.
This script fetches each case URL and adds `case_institution` + `case_specialty`
+ `case_findings_text` to the watchlist so downstream targeting can filter by
the actual named affiliation.

Usage:
  python enrich_ori_cases.py <watchlist.json> <out.json>
"""
from __future__ import annotations
import argparse, json, re, sys, time
from pathlib import Path
import urllib.request

UA = {"User-Agent": "sfh-extrapolator/1 (rupertwmurphy@gmail.com)"}


def get(url: str, timeout: int = 30, retries: int = 4) -> str | None:
    for a in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            time.sleep(2 ** a)
    return None


INST_PAT = re.compile(
    r"(?:respondent|respondent's|Dr\.?[^,\n]{0,40}?|the\s+respondent)\s+(?:was\s+)?"
    r"(?:an?\s+)?(?:employed\s+by|(?:former\s+)?(?:employee|Postdoctoral(?:\s+Research)?)\s+of|"
    r"(?:former\s+)?(?:Postdoctoral\s+Research\s+)?(?:Scholar|Fellow|Associate|Investigator|Scientist)?\s*(?:at|of|with))"
    r"\s+((?:the\s+)?(?:University|Institute|Hospital|College|Center|Centre|Corporation|Company)[^,.]{5,90})",
    re.IGNORECASE,
)

# Fallback: any capitalised sequence containing "University|Institute|Hospital|College".
ANY_INST_PAT = re.compile(
    r"\b((?:[A-Z][A-Za-z]+\s+){0,4}"
    r"(?:University|Institute|Hospital|College|Center|Centre|Foundation)"
    r"(?:\s+(?:of|at)\s+[A-Z][A-Za-z\s]{2,40})?)"
)


def strip_html(s: str) -> str:
    s = re.sub(r"<script.*?</script>", " ", s, flags=re.DOTALL | re.IGNORECASE)
    s = re.sub(r"<style.*?</style>", " ", s, flags=re.DOTALL | re.IGNORECASE)
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"&nbsp;", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def extract_institution(text: str) -> str | None:
    m = INST_PAT.search(text)
    if m:
        return m.group(1).strip()
    # Fallback: first university-ish token
    m2 = ANY_INST_PAT.search(text)
    if m2:
        return m2.group(1).strip()
    return None


def extract_grant_ids(text: str) -> list[str]:
    # NIH-style grant numbers: R01/K23/... plus IC letters + 6+ digits.
    return list(set(re.findall(r"\b(?:[A-Z]\d{1,2})\s?[A-Z]{2}\s?\d{5,7}\b", text)))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("watchlist", type=Path)
    ap.add_argument("out", type=Path)
    args = ap.parse_args()

    wl = json.loads(args.watchlist.read_text())
    people = wl.get("people", [])
    enriched = []
    for i, p in enumerate(people):
        url = p.get("url") or ""
        if not url or "case-summary-" not in url:
            enriched.append(p)
            continue
        raw = get(url)
        if not raw:
            enriched.append(p)
            continue
        text = strip_html(raw)
        p2 = dict(p)
        p2["case_institution"] = extract_institution(text)
        p2["case_grant_ids"] = extract_grant_ids(text)
        # Take first 400 chars of case-findings section as evidence excerpt
        m = re.search(r"(?:findings|found that)\s*:?\s*(.{80,600})", text, re.IGNORECASE)
        if m:
            p2["findings_excerpt"] = m.group(1).strip()[:500]
        enriched.append(p2)
        if (i + 1) % 5 == 0:
            print(f"enriched {i+1}/{len(people)}", flush=True)
        time.sleep(0.5)
    wl["people"] = enriched
    args.out.write_text(json.dumps(wl, indent=2))
    n_with_inst = sum(1 for p in enriched if p.get("case_institution"))
    n_with_grants = sum(1 for p in enriched if p.get("case_grant_ids"))
    print(json.dumps({
        "enriched": len(enriched),
        "with_institution": n_with_inst,
        "with_grant_ids": n_with_grants,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
