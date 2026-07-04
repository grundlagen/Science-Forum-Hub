#!/usr/bin/env python3
"""
Route A: Fetch ransomware victim data from ransomware.live v2 API.
Pulls all victims, filters by US domain presence, and saves as JSON.
"""
import json, sys, time, requests
from pathlib import Path
from datetime import datetime

API_BASE = "https://api.ransomware.live/v2"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "ransomware"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def fetch_json(endpoint):
    """Fetch JSON from ransomware.live v2 API."""
    url = f"{API_BASE}/{endpoint}"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()

def main():
    all_victims = []

    # Fetch victims by year (2020-2026)
    for year in range(2020, 2027):
        try:
            data = fetch_json(f"victims/{year}")
            for v in data:
                v["_year"] = year
            all_victims.extend(data)
            print(f"  {year}: {len(data)} victims")
            time.sleep(0.5)
        except Exception as e:
            print(f"  {year}: FAILED - {e}")

    print(f"\nTotal victims fetched: {len(all_victims)}")

    # Filter: must have a domain
    with_domains = [v for v in all_victims if v.get("domain") and v["domain"].strip()]
    print(f"With domains: {len(with_domains)}")

    # Filter: US victims or global orgs
    us_victims = [v for v in with_domains
                  if v.get("country") == "US" or not v.get("country")]
    print(f"US/global with domains: {len(us_victims)}")

    # Normalize into standard schema
    normalized = []
    for v in us_victims:
        entry = {
            "victim_name": v.get("victim", v.get("domain", "unknown")),
            "victim_domains": [v["domain"]] if v.get("domain") else [],
            "breach_date": (v.get("attackdate", "") or "")[:10],
            "ransom_group": v.get("group", "unknown"),
            "leak_size_gb": v.get("data_size"),
            "disclosure_status": "disclosed" if (v.get("press") or {}).get("link") else "undisclosed",
            "country": v.get("country", ""),
            "activity": v.get("activity", ""),
            "description": v.get("description", ""),
            "_source_year": v.get("_year"),
        }
        normalized.append(entry)

    # Save
    output_file = OUTPUT_DIR / "ransomware_victims.json"
    with open(output_file, "w") as f:
        json.dump(normalized, f, indent=2)
    print(f"\nSaved {len(normalized)} normalized victims to {output_file}")

    # Stats
    groups = {}
    for v in normalized:
        g = v["ransom_group"]
        groups[g] = groups.get(g, 0) + 1
    top_groups = sorted(groups.items(), key=lambda x: -x[1])[:20]
    print(f"\nTop 20 ransomware groups:")
    for g, c in top_groups:
        print(f"  {g}: {c}")

if __name__ == "__main__":
    main()
