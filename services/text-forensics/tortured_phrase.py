"""
Tortured-phrase scanner — Cabanac/Labbé Problematic Paper Screener signature list,
adapted for our JSONL abstracts. A tortured phrase is a mangled paraphrase produced
by synonym-swap chatbots and paper-mill translation to evade plagiarism detectors.
Very high specificity: real papers do not accidentally write "colossal information"
for "big data" or "irregular backwoods" for "random forest".

Runs streaming over any {id,title,abstract} JSONL. Cheap CPU. Idempotent — safe to
re-run against a growing works.jsonl.

Usage:
  python tortured_phrase.py <in.jsonl> <out_leads.jsonl>
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

# Subset of the PPS list, biased to CS/biomedical ML tortured phrases that appear
# in NIH- and NSF-funded papers. Extend by grepping the full PPS list.
# https://github.com/Delgado-EON/tortured-phrases (community mirror)
TORTURED = [
    # ML
    "colossal information", "colossal informations",       # big data
    "counterfeit consciousness", "counterfeit knowledge",  # artificial intelligence
    "irregular backwoods", "arbitrary woodland",           # random forest
    "convolutional brain organization",                    # convolutional neural network
    "profound learning", "profoundly learning",            # deep learning
    "help vector machine", "supporting vector machine",    # support vector machine
    "gullible bayes", "gullible bayesian",                 # naive bayes
    "mean square blunder", "mean square mistake",          # mean square error
    "signal-to-clamor",                                    # signal-to-noise
    "credulous bayes",                                     # naive bayes
    # optimization / stats
    "power utilization",                                   # energy consumption
    "monster information",                                 # big data
    "shrewd network", "keen network",                      # smart grid
    # biomedical
    "bosom malignancy", "bosom growth",                    # breast cancer
    "safe framework",                                      # immune system
    "insect microbial",                                    # antimicrobial
    "chest disease",                                       # lung cancer
    "microbe safe",                                        # antibiotic resistant / bacteria resistant
    "cell reinforcement",                                  # antioxidant
    "cardiovascular breakdown",                            # heart failure
    "renal disappointment",                                # kidney failure
    "atomic weight",                                       # molecular weight (in wrong context)
    "vein",                                                # blood vessel — too ambiguous, drop
    # generic
    "test size", "example size",                           # sample size (contextual)
    "informational collection", "informational index",     # dataset
    "outcome parameter",                                   # outcome measure
    "in-house created",                                    # in-house developed
]

# Drop the truly ambiguous ones.
TORTURED = [t for t in TORTURED if t not in {"vein", "test size", "example size", "atomic weight"}]

# Compile as a single regex for speed.
PAT = re.compile("|".join(re.escape(p) for p in TORTURED), re.IGNORECASE)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("in_path", type=Path)
    ap.add_argument("out", type=Path)
    args = ap.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    hits = 0
    t0 = time.time()
    with args.in_path.open() as ih, args.out.open("w") as oh:
        for line in ih:
            try:
                r = json.loads(line)
            except Exception:
                continue
            n += 1
            text = (r.get("title") or "") + " " + (r.get("abstract") or "")
            matches = PAT.findall(text)
            if not matches:
                continue
            oh.write(json.dumps({
                "id": r.get("id"),
                "doi": r.get("doi"),
                "pmid": r.get("pmid"),
                "title": r.get("title"),
                "phrases": sorted(set(m.lower() for m in matches)),
                "count": len(matches),
            }) + "\n")
            hits += 1
    print(json.dumps({"scanned": n, "hits": hits, "seconds": round(time.time()-t0,1)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
