#!/usr/bin/env bash
# Large-scale text-forensics run.
#   - working dir on /dev/shm (31GB RAM tmpfs) so container overlay stays free
#   - multi-funder US-federal filter
#   - Retraction Watch DOI join
#   - FAISS HNSW scan (works past 200k where flat cosine dies)
#   - lexical Jaccard verification on top-N to kill semantic-only noise
#   - artefacts copied to /workspace/text-run-02 at the end; big intermediates dropped
#
# Env:
#   LIMIT              — max works fetched (default 800000)
#   FROM_YEAR          — earliest publication year (default 2015)
#   FUNDERS            — 'us-federal' or comma-separated OpenAlex funder IDs (default us-federal)
#   THRESHOLD          — HNSW cosine cutoff (default 0.94)
#   JACCARD_MIN        — lexical Jaccard6 cutoff on top-N (default 0.15)
#   JACCARD_CHECK_TOP  — how many top-cosine pairs to lex-check (default 20000)
#   HF_ENDPOINT        — set to https://hf-mirror.com on the China vast.ai box
set -euo pipefail

LIMIT=${LIMIT:-800000}
FROM_YEAR=${FROM_YEAR:-2015}
FUNDERS=${FUNDERS:-us-federal}
THRESHOLD=${THRESHOLD:-0.94}
JACCARD_MIN=${JACCARD_MIN:-0.15}
JACCARD_CHECK_TOP=${JACCARD_CHECK_TOP:-20000}

SHM=/dev/shm/text-run
FINAL=${FINAL:-/workspace/text-run-02}
mkdir -p "$SHM/logs" "$FINAL/logs"
cd "$(dirname "$0")/../.."

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$SHM/logs/run.log" >>"$FINAL/logs/run.log"; }

log "config LIMIT=$LIMIT FUNDERS=$FUNDERS FROM_YEAR=$FROM_YEAR THRESHOLD=$THRESHOLD"

log "phase 0 — deps"
python3 -c "import transformers,torch,faiss,numpy" 2>/dev/null || {
  pip install -q transformers==4.44.2 "faiss-cpu>=1.9"
}

log "phase 1 — retraction watch DOI list"
python3 services/text-forensics/fetch_retractions.py "$SHM/retracted_dois.txt" 2>&1 | tee -a "$SHM/logs/retractions.log"

log "phase 2 — fetch $LIMIT federal-funded works (funders=$FUNDERS)"
python3 services/text-forensics/fetch_openalex_nih.py "$SHM/works.jsonl" \
  --limit "$LIMIT" --from-year "$FROM_YEAR" --funders "$FUNDERS" 2>&1 | tee -a "$SHM/logs/fetch.log"
FETCHED=$(wc -l < "$SHM/works.jsonl")
log "  fetched $FETCHED"

log "phase 3 — SPECTER2 embed on GPU"
python3 services/text-forensics/embed_abstracts.py "$SHM/works.jsonl" "$SHM/emb" \
  --batch 128 2>&1 | tee -a "$SHM/logs/embed.log"

log "phase 4 — FAISS HNSW scan (threshold=$THRESHOLD, lex check top=$JACCARD_CHECK_TOP)"
python3 services/text-forensics/hnsw_scan.py "$SHM/emb" "$SHM/works.jsonl" "$SHM/leads.jsonl" \
  --threshold "$THRESHOLD" --top-k 10 \
  --retraction-doi-file "$SHM/retracted_dois.txt" \
  --jaccard-min "$JACCARD_MIN" --jaccard-check-top "$JACCARD_CHECK_TOP" \
  2>&1 | tee -a "$SHM/logs/scan.log"

log "phase 5 — persist"
# Reduce works.jsonl to metadata (drop abstract) so it fits final storage.
python3 - <<PY
import json
from pathlib import Path
inp = Path("$SHM/works.jsonl")
out = Path("$FINAL/works_meta.jsonl")
with inp.open() as fh, out.open("w") as ofh:
    for line in fh:
        try:
            r = json.loads(line)
        except Exception:
            continue
        r.pop("abstract", None)
        ofh.write(json.dumps(r) + "\n")
print("meta lines", sum(1 for _ in out.open()))
PY
cp "$SHM/emb.npz" "$FINAL/emb.npz"
cp "$SHM/emb.meta.json" "$FINAL/emb.meta.json" 2>/dev/null || true
cp "$SHM/leads_verified.jsonl" "$FINAL/leads_verified.jsonl" 2>/dev/null || true
cp "$SHM/leads_summary.json" "$FINAL/leads_summary.json" 2>/dev/null || true
cp "$SHM/retracted_dois.txt" "$FINAL/retracted_dois.txt"
cp -r "$SHM/logs" "$FINAL/logs"

# Optional: push to Google Drive if rclone gdrive: works
if rclone lsd gdrive: >/dev/null 2>&1; then
  log "phase 6 — rclone push to gdrive:sfh-text-run-02/"
  rclone copy "$FINAL" "gdrive:sfh-text-run-02/" --transfers 4 2>&1 | tee -a "$FINAL/logs/rclone.log"
else
  log "phase 6 skipped — gdrive: not configured (run: rclone config reconnect gdrive: locally, then push conf)"
fi

log "done -> $FINAL"
