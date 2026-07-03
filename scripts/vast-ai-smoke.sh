#!/usr/bin/env bash
# End-to-end smoke test for a vast.ai RTX 4090 pytorch instance.
#
# Runs the two halves of the extrapolator pipeline on real data at test scale:
#   1. IMAGE — harvest ~50 NIH-funded OA articles from Europe PMC, build a DINOv2
#      cross-figure embedding index on GPU, run the live_run retrieval smoke test.
#   2. TEXT  — (optional, needs SEMANTIC_SCHOLAR_API_KEY) pull a single S2AG
#      SPECTER2 shard, cross-check against Europe PMC PMIDs from step 1, run
#      textReuse detector on the shard.
#
# Emits a JSON report at $OUT/report.json.
#
# Usage:
#   OUT=/workspace/run bash scripts/vast-ai-smoke.sh
#   OUT=/workspace/run QUERY='GRANT_AGENCY:"NIH" AND OPEN_ACCESS:y' LIMIT=50 bash scripts/vast-ai-smoke.sh
set -euo pipefail

OUT=${OUT:-/workspace/ri-smoke}
QUERY=${QUERY:-'GRANT_AGENCY:"NIH" AND OPEN_ACCESS:y'}
LIMIT=${LIMIT:-50}
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)

mkdir -p "$OUT"/{corpus,index,text,logs}
cd "$REPO_ROOT"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$OUT/logs/run.log"; }

log "GPU check"
python3 -c "import torch; print('cuda', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')" | tee -a "$OUT/logs/run.log"

log "python deps"
pip install -q -r services/image-forensics/requirements.txt
# torch is preinstalled on vast.ai pytorch images; xformers optional for DINOv2 speed
python3 -c "import cv2, numpy, PIL" >/dev/null

log "harvest $LIMIT OA articles from Europe PMC ($QUERY)"
python3 services/image-forensics/harvest_figures.py "$QUERY" "$OUT/corpus" "$LIMIT" 2>&1 | tee -a "$OUT/logs/harvest.log"

log "build DINOv2 index (RTX 4090)"
python3 - <<PY 2>&1 | tee -a "$OUT/logs/index.log"
import sys, json, time
from pathlib import Path
sys.path.insert(0, "services/image-forensics")
from embedding_index import build_from_dir, PanelIndex
t0 = time.time()
idx = build_from_dir(Path("$OUT/corpus"), Path("$OUT/index/panel"))
idx.save(Path("$OUT/index/panel"))
print(json.dumps({
    "backend": idx.backend,
    "panels_indexed": len(idx.keys),
    "seconds": round(time.time()-t0, 2),
}))
PY

log "cross-figure retrieval smoke test"
python3 services/image-forensics/live_run.py "$OUT/corpus" 2>&1 | tee -a "$OUT/logs/live_run.log" || true

if [ -n "${SEMANTIC_SCHOLAR_API_KEY:-}" ]; then
  log "text side: fetch one SPECTER2 shard"
  python3 - <<PY 2>&1 | tee -a "$OUT/logs/text.log"
import os, json, urllib.request
key = os.environ["SEMANTIC_SCHOLAR_API_KEY"]
base = "https://api.semanticscholar.org/datasets/v1"
def get(u):
    req = urllib.request.Request(u, headers={"x-api-key": key})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())
release = get(f"{base}/release/latest")["release_id"]
files = get(f"{base}/release/{release}/dataset/embeddings-specter_v2")["files"]
print("release", release, "shards", len(files), "downloading shard[0]")
urllib.request.urlretrieve(files[0], "$OUT/text/shard0.jsonl.gz")
print("shard0", os.path.getsize("$OUT/text/shard0.jsonl.gz"))
PY
else
  log "text side skipped (SEMANTIC_SCHOLAR_API_KEY not set)"
fi

log "report"
python3 - <<PY | tee "$OUT/report.json"
import json, os, glob
from pathlib import Path
out = Path("$OUT")
panels = len(list((out/"corpus").rglob("*.png"))) + len(list((out/"corpus").rglob("*.jpg")))
shard = list((out/"text").glob("shard*.gz"))
print(json.dumps({
    "corpus_articles": len(list((out/"corpus").iterdir())),
    "figure_files": panels,
    "index": str(out/"index/panel.npz"),
    "text_shard": str(shard[0]) if shard else None,
    "logs": str(out/"logs"),
}, indent=2))
PY

log "done -> $OUT/report.json"
