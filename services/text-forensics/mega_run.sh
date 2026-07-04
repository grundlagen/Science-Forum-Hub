#!/usr/bin/env bash
# Wide-net autonomous run. Launches independent long-running detectors:
#   1. NIH RePORTER grant-abstract corpus download
#   2. Tortured-phrase scan (grows with works.jsonl)
#   3. Retraction-cluster analysis (waits for retracted_dois.txt to appear)
#   4. RePORTER embed on GPU (waits until scale_run frees the GPU)
#   5. Grant-vs-paper cross-search
#   6. rclone push-loop → gdrive:sfh/  (every 10 min)
#
# Each phase runs detached under `nohup`. All logs under /workspace/mega/logs/.
# Safe to run alongside scale_run.sh.
set -euo pipefail

BASE=/workspace/mega
mkdir -p "$BASE/logs" "$BASE/reporter" "$BASE/tortured" "$BASE/cluster"
cd "$(dirname "$0")/../.."

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$BASE/logs/mega.log"; }

log "spawn: rclone push-loop → gdrive:sfh/mega"
(
  while true; do
    rclone lsd gdrive: >/dev/null 2>&1 && rclone copy /workspace/mega gdrive:sfh/mega --transfers 4 --checkers 4 --no-traverse 2>>/workspace/mega/logs/rclone.log
    rclone lsd gdrive: >/dev/null 2>&1 && rclone copy /workspace/text-run-02 gdrive:sfh/text-run-02 --transfers 4 --checkers 4 --no-traverse 2>>/workspace/mega/logs/rclone.log
    sleep 600
  done
) > "$BASE/logs/rclone_loop.log" 2>&1 &
echo $! > "$BASE/logs/rclone_loop.pid"

log "spawn: NIH RePORTER grant-abstract download (~1M projects)"
nohup python3 services/text-forensics/fetch_reporter.py "$BASE/reporter/grants.jsonl" \
  --from-fy 2015 --limit 1500000 > "$BASE/logs/reporter.log" 2>&1 &
echo $! > "$BASE/logs/reporter.pid"

log "spawn: tortured-phrase scan loop over scale_run works.jsonl (updates every 5 min)"
(
  while true; do
    src=/dev/shm/text-run/works.jsonl
    [ -f "$src" ] || src=/workspace/text-run-02/works_meta.jsonl
    [ -f "$src" ] && python3 services/text-forensics/tortured_phrase.py "$src" "$BASE/tortured/leads.jsonl" >/dev/null 2>&1
    sleep 300
  done
) > "$BASE/logs/tortured_loop.log" 2>&1 &
echo $! > "$BASE/logs/tortured_loop.pid"

log "spawn: retraction-cluster (waits for retracted_dois.txt + works.jsonl)"
(
  while true; do
    src_w=/dev/shm/text-run/works.jsonl
    src_r=/dev/shm/text-run/retracted_dois.txt
    [ -f "$src_w" ] && [ -f "$src_r" ] && \
      python3 services/text-forensics/retraction_cluster.py "$src_w" "$src_r" "$BASE/cluster/retraction_pis.json" >/dev/null 2>&1
    sleep 900
  done
) > "$BASE/logs/cluster_loop.log" 2>&1 &
echo $! > "$BASE/logs/cluster_loop.pid"

log "spawn: RePORTER embed (waits until scale_run frees the GPU + reporter grants.jsonl exists)"
(
  # wait for scale_run to finish embedding (its emb.npz appears in text-run-02)
  while [ ! -f /workspace/text-run-02/emb.npz ] && [ ! -f /dev/shm/text-run/emb.npz ]; do sleep 60; done
  # wait for reporter fetch to reach at least 50k records
  while true; do
    [ -f "$BASE/reporter/grants.jsonl" ] || { sleep 60; continue; }
    lines=$(wc -l < "$BASE/reporter/grants.jsonl")
    [ "$lines" -ge 50000 ] && break
    sleep 120
  done
  export HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"
  python3 services/text-forensics/embed_abstracts.py "$BASE/reporter/grants.jsonl" "$BASE/reporter/emb" \
    --batch 128 > "$BASE/logs/reporter_embed.log" 2>&1
) > "$BASE/logs/reporter_embed_wait.log" 2>&1 &
echo $! > "$BASE/logs/reporter_embed.pid"

log "all workers spawned. tail $BASE/logs/mega.log for status."
