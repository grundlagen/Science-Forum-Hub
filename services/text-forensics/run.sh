#!/usr/bin/env bash
# End-to-end text-reuse smoke run on a GPU box.
#   1. fetch NIH-funded works from OpenAlex (free, no auth)
#   2. SPECTER2 embed on GPU
#   3. FAISS cross-award near-dup scan
#   4. optional Retraction Watch join
#
# Usage:
#   OUT=/workspace/text-run LIMIT=20000 bash services/text-forensics/run.sh
set -euo pipefail

OUT=${OUT:-/workspace/text-run}
LIMIT=${LIMIT:-20000}
THRESHOLD=${THRESHOLD:-0.94}
BATCH=${BATCH:-64}
FROM_YEAR=${FROM_YEAR:-2015}

mkdir -p "$OUT/logs"
cd "$(dirname "$0")/../.."

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$OUT/logs/run.log"; }

log "phase 0 — deps"
python3 -c "import torch, transformers, numpy" 2>/dev/null || pip install -q transformers==4.44.2 faiss-cpu==1.8.0
python3 -c "import numpy" 2>/dev/null || pip install -q numpy

log "phase 1 — fetch NIH-funded works (limit=$LIMIT from $FROM_YEAR)"
if [ ! -f "$OUT/works.jsonl" ] || [ "${FORCE:-0}" = "1" ]; then
  python3 services/text-forensics/fetch_openalex_nih.py "$OUT/works.jsonl" \
    --limit "$LIMIT" --from-year "$FROM_YEAR" 2>&1 | tee -a "$OUT/logs/fetch.log"
else
  log "  skip — $OUT/works.jsonl exists (FORCE=1 to redo)"
fi
wc -l "$OUT/works.jsonl" | tee -a "$OUT/logs/fetch.log"

log "phase 2 — SPECTER2 embed on GPU"
if [ ! -f "$OUT/emb.npz" ] || [ "${FORCE:-0}" = "1" ]; then
  python3 services/text-forensics/embed_abstracts.py "$OUT/works.jsonl" "$OUT/emb" \
    --batch "$BATCH" 2>&1 | tee -a "$OUT/logs/embed.log"
else
  log "  skip — $OUT/emb.npz exists"
fi

log "phase 3 — cross-award near-dup scan (threshold=$THRESHOLD)"
python3 services/text-forensics/near_dup_scan.py "$OUT/emb" "$OUT/works.jsonl" "$OUT/leads.jsonl" \
  --threshold "$THRESHOLD" --top-k 5 \
  ${RETRACTION_DOI_FILE:+--retraction-doi-file "$RETRACTION_DOI_FILE"} \
  2>&1 | tee -a "$OUT/logs/scan.log"

log "phase 4 — top leads by score"
python3 - <<PY | tee "$OUT/top_leads.json"
import json, heapq
from pathlib import Path
leads = []
with (Path("$OUT")/"leads.jsonl").open() as fh:
    for line in fh:
        try:
            leads.append(json.loads(line))
        except Exception:
            pass
# Deduplicate unordered pair
seen=set(); uniq=[]
for l in leads:
    k = tuple(sorted([l["a"], l["b"]]))
    if k in seen: continue
    seen.add(k); uniq.append(l)
top = heapq.nlargest(50, uniq, key=lambda x: x["score"])
print(json.dumps({
  "n_leads_unique": len(uniq),
  "n_cross_award": sum(1 for l in uniq if l["cross_award"]),
  "n_same_author": sum(1 for l in uniq if l["same_author"]),
  "n_retracted": sum(1 for l in uniq if l["retracted"]),
  "top": top,
}, indent=2))
PY

log "done -> $OUT/top_leads.json"
