#!/usr/bin/env python3
"""Screen official NCDOT central-letting bid tabs for repeated bidder-pair anomalies.

This is a lead generator, not a fraud classifier. It downloads the XLS bid tabs
linked by NCDOT, reconstructs per-contract bidder totals from item extensions,
and measures repeated co-bidding, close total bids, winner alternation, funding,
and item-price similarity. Every high-scoring pair still requires falsification.
"""
from __future__ import annotations

import argparse
import io
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import urljoin

import numpy as np
import pandas as pd
import requests
from bs4 import BeautifulSoup

PAGE = "https://connect.ncdot.gov/letting/pages/bid-tabs.aspx"
UA = {"User-Agent": "Mozilla/5.0 procurement-research/1.0"}
BIDDER_SLOTS = ((24, 25, 26, 27), (29, 30, 31, 32), (34, 35, 36, 37))


def clean_text(x):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return ""
    return re.sub(r"\s+", " ", str(x)).strip()


def bidder_key(name):
    # Conservative: normalize case/spacing only. Do not collapse LLC/Inc variants.
    return clean_text(name).upper()


def fnum(x):
    try:
        if x is None or pd.isna(x) or clean_text(x) == "":
            return None
        v = float(x)
        return v if math.isfinite(v) else None
    except Exception:
        return None


def xls_links(session):
    r = session.get(PAGE, headers=UA, timeout=60)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    out, seen = [], set()
    for a in soup.find_all("a", href=True):
        href = urljoin(PAGE, a["href"])
        txt = " ".join(a.stripped_strings)
        if re.search(r"\.xls(?:x)?(?:$|\?)", href, re.I) or re.search(r"\bXLS\b", txt, re.I):
            if href not in seen:
                seen.add(href)
                out.append((txt, href))
    return out


def parse_workbook(content, source_url):
    sheets = pd.read_excel(io.BytesIO(content), sheet_name=None, header=None)
    records = []
    item_prices = defaultdict(dict)  # (contract_key,bidder)-> itemkey -> unitprice
    meta = {}
    for sheet, df in sheets.items():
        for _, row in df.iterrows():
            vals = list(row.values) + [None] * max(0, 40 - len(row))
            let_id = clean_text(vals[0])
            contract = clean_text(vals[5])
            if not let_id or not contract:
                continue
            ckey = f"{let_id}::{contract}"
            item_no = clean_text(vals[14])
            item_seq = clean_text(vals[16])
            item_desc = clean_text(vals[19])
            item_detail = clean_text(vals[20])
            qty = fnum(vals[21])
            unit = clean_text(vals[22])
            funding = clean_text(vals[8])
            meta.setdefault(ckey, {
                "contract_key": ckey,
                "letting": let_id,
                "letting_date": clean_text(vals[2]),
                "contract": contract,
                "wbs": clean_text(vals[6]),
                "project": clean_text(vals[7]),
                "funding": funding,
                "county": clean_text(vals[9]),
                "work_type": clean_text(vals[12]),
                "location": clean_text(vals[13]),
                "source_url": source_url,
            })
            # Summary rows have blank item number; exclude to avoid double counting.
            if not item_no:
                continue
            item_key = "|".join((item_no, item_seq, item_desc, item_detail, unit))
            for name_i, city_i, unit_i, ext_i in BIDDER_SLOTS:
                raw_name = clean_text(vals[name_i])
                if not raw_name:
                    continue
                b = bidder_key(raw_name)
                up = fnum(vals[unit_i])
                ext = fnum(vals[ext_i])
                if ext is None:
                    continue
                records.append({
                    "contract_key": ckey,
                    "bidder": b,
                    "bidder_raw": raw_name,
                    "bidder_city": clean_text(vals[city_i]),
                    "item_key": item_key,
                    "item_no": item_no,
                    "item_desc": item_desc,
                    "quantity": qty,
                    "unit": unit,
                    "unit_price": up,
                    "extended": ext,
                })
                if up is not None and up > 0:
                    item_prices[(ckey, b)][item_key] = up
    return records, item_prices, meta


def is_state_only(funding):
    s = clean_text(funding).upper()
    return s == "STATE FUNDED" or ("STATE FUNDED" in s and not re.search(r"\d", s.replace("STATE FUNDED", "")))


def price_similarity(prices_a, prices_b):
    keys = sorted(set(prices_a) & set(prices_b))
    pairs = [(prices_a[k], prices_b[k]) for k in keys if prices_a[k] > 0 and prices_b[k] > 0]
    if not pairs:
        return {"common_items": 0, "exact_price_fraction": None, "log_price_corr": None,
                "median_abs_log_ratio": None}
    a = np.array([x for x, _ in pairs], dtype=float)
    b = np.array([y for _, y in pairs], dtype=float)
    exact = float(np.mean(np.isclose(a, b, rtol=0, atol=1e-9)))
    corr = None
    if len(pairs) >= 8 and np.std(np.log(a)) > 1e-9 and np.std(np.log(b)) > 1e-9:
        corr = float(np.corrcoef(np.log(a), np.log(b))[0, 1])
    med = float(np.median(np.abs(np.log(a / b))))
    return {"common_items": len(pairs), "exact_price_fraction": exact,
            "log_price_corr": corr, "median_abs_log_ratio": med}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="artifacts/procurement_forensics/ncdot")
    ap.add_argument("--max-files", type=int, default=0, help="0 = all current XLS links")
    args = ap.parse_args()
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    s = requests.Session()
    links = xls_links(s)
    if args.max_files:
        links = links[:args.max_files]
    all_records, all_prices, all_meta = [], defaultdict(dict), {}
    manifest = []
    for label, url in links:
        print("DOWNLOAD", url)
        r = s.get(url, headers=UA, timeout=120); r.raise_for_status()
        recs, prices, meta = parse_workbook(r.content, url)
        print("  bytes", len(r.content), "item records", len(recs), "contracts", len(meta))
        all_records.extend(recs); all_meta.update(meta)
        for k, d in prices.items(): all_prices[k].update(d)
        manifest.append({"label": label, "url": url, "bytes": len(r.content), "records": len(recs), "contracts": len(meta)})

    if not all_records:
        raise SystemExit("No NCDOT item records parsed")
    items = pd.DataFrame(all_records)
    # Summing item extensions reconstructs bidder total without relying on summary-row layout.
    bids = (items.groupby(["contract_key", "bidder"], as_index=False)
            .agg(total=("extended", "sum"), items=("item_key", "nunique"),
                 bidder_raw=("bidder_raw", "first"), bidder_city=("bidder_city", "first")))
    for col in ["letting", "letting_date", "contract", "wbs", "project", "funding", "county", "work_type", "location", "source_url"]:
        bids[col] = bids["contract_key"].map(lambda k: all_meta[k][col])
    bids["rank"] = bids.groupby("contract_key")["total"].rank(method="min", ascending=True).astype(int)
    bids.to_csv(out / "bids.csv", index=False)

    pair_events = defaultdict(list)
    for ckey, g in bids.groupby("contract_key"):
        gg = g.sort_values("bidder")
        rows = list(gg.to_dict("records"))
        for i in range(len(rows)):
            for j in range(i + 1, len(rows)):
                a, b = rows[i], rows[j]
                lo, hi = sorted((a["total"], b["total"]))
                if lo <= 0: continue
                gap = (hi - lo) / lo * 100.0
                sim = price_similarity(all_prices[(ckey, a["bidder"])], all_prices[(ckey, b["bidder"])])
                event = {
                    "contract_key": ckey,
                    "letting": a["letting"], "letting_date": a["letting_date"], "contract": a["contract"],
                    "project": a["project"], "funding": a["funding"], "county": a["county"],
                    "bidder_a": a["bidder"], "bidder_b": b["bidder"],
                    "total_a": a["total"], "total_b": b["total"],
                    "rank_a": a["rank"], "rank_b": b["rank"], "gap_pct": gap,
                    "a_won": int(a["rank"] == 1), "b_won": int(b["rank"] == 1),
                    "state_only": int(is_state_only(a["funding"])),
                    **sim,
                }
                pair_events[(a["bidder"], b["bidder"])].append(event)

    pair_rows = []
    event_rows = []
    for (a, b), evs in pair_events.items():
        event_rows.extend(evs)
        gaps = np.array([e["gap_pct"] for e in evs], dtype=float)
        federal = sum(1 - e["state_only"] for e in evs)
        a_wins, b_wins = sum(e["a_won"] for e in evs), sum(e["b_won"] for e in evs)
        exacts = [e["exact_price_fraction"] for e in evs if e["exact_price_fraction"] is not None]
        corrs = [e["log_price_corr"] for e in evs if e["log_price_corr"] is not None and math.isfinite(e["log_price_corr"])]
        co = len(evs)
        close05, close1, close2 = int(np.sum(gaps <= .5)), int(np.sum(gaps <= 1)), int(np.sum(gaps <= 2))
        alternation = int(a_wins > 0 and b_wins > 0)
        # Lead score deliberately rewards persistence and close totals, but is not a probability of wrongdoing.
        score = (2.2 * math.log1p(co) + 2.0 * close05 + 1.2 * max(0, close1-close05)
                 + 0.6 * max(0, close2-close1) + 0.35 * federal + 1.25 * alternation)
        if co >= 3:
            score += max(0, 1.5 - float(np.median(gaps)) / 2.0)
        if exacts and np.mean(exacts) > .30 and co >= 2:
            score += 0.5  # weak: common subcontractor pricing is an obvious innocent explanation
        pair_rows.append({
            "bidder_a": a, "bidder_b": b, "co_bids": co, "federal_or_mixed_co_bids": federal,
            "a_overall_wins": a_wins, "b_overall_wins": b_wins, "winner_alternation": alternation,
            "close_0_5pct": close05, "close_1pct": close1, "close_2pct": close2,
            "median_gap_pct": float(np.median(gaps)), "mean_gap_pct": float(np.mean(gaps)),
            "gap_std_pct": float(np.std(gaps)) if co > 1 else None,
            "mean_exact_item_price_fraction": float(np.mean(exacts)) if exacts else None,
            "mean_log_item_price_corr": float(np.mean(corrs)) if corrs else None,
            "lead_score": score,
        })
    pairdf = pd.DataFrame(pair_rows).sort_values(["lead_score", "co_bids"], ascending=False)
    evdf = pd.DataFrame(event_rows)
    pairdf.to_csv(out / "pair_screen.csv", index=False)
    evdf.to_csv(out / "pair_events.csv", index=False)
    items.to_csv(out / "item_bids.csv.gz", index=False, compression="gzip")
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    top = pairdf.head(30).to_dict("records")
    summary = {
        "source": PAGE, "xls_files": len(links), "contracts": int(bids.contract_key.nunique()),
        "bidders": int(bids.bidder.nunique()), "bid_rows": int(len(bids)), "item_bid_rows": int(len(items)),
        "pair_count": int(len(pairdf)), "note": "Lead scores are triage signals, not findings of collusion.",
        "top_pairs": top,
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps({k:v for k,v in summary.items() if k != "top_pairs"}, indent=2))
    print("\nTOP PAIRS")
    print(pairdf.head(30).to_string(index=False))

if __name__ == "__main__":
    main()
