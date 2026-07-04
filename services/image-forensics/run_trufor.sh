#!/usr/bin/env bash
# Batch-run TruFor over harvested Europe PMC OA figures.
#
# TruFor (Guerra et al., 2023) is a pretrained image-manipulation detector — outputs
# a per-image score in [0,1], an anomaly heatmap, and a confidence map. Weights
# from https://www.grip.unina.it/download/prog/TruFor/TruFor_weights.zip.
#
# Usage:
#   FIG_DIR=/dev/shm/figures OUT=/dev/shm/trufor_out bash services/image-forensics/run_trufor.sh
set -euo pipefail

FIG_DIR=${FIG_DIR:-/dev/shm/figures}
OUT=${OUT:-/dev/shm/trufor_out}
TRUFOR_ROOT=${TRUFOR_ROOT:-/workspace/TruFor}
mkdir -p "$OUT"

cd "$TRUFOR_ROOT/TruFor_train_test"

# TruFor's test.py accepts a glob. Recursive glob over all image types.
python3 test.py -g 0 -in "$FIG_DIR/**/*.jpg"  -out "$OUT" -exp trufor_ph3
python3 test.py -g 0 -in "$FIG_DIR/**/*.jpeg" -out "$OUT" -exp trufor_ph3
python3 test.py -g 0 -in "$FIG_DIR/**/*.png"  -out "$OUT" -exp trufor_ph3
python3 test.py -g 0 -in "$FIG_DIR/**/*.tif"  -out "$OUT" -exp trufor_ph3
python3 test.py -g 0 -in "$FIG_DIR/**/*.tiff" -out "$OUT" -exp trufor_ph3

# Aggregate scores. TruFor writes one .npz per input image containing 'score'.
python3 - <<'PY'
import json, os
from pathlib import Path
import numpy as np
OUT = Path(os.environ.get("OUT", "/dev/shm/trufor_out"))
leads = []
for p in OUT.glob("**/*.npz"):
    try:
        z = np.load(p, allow_pickle=True)
        score = float(z["score"])
        leads.append({"file": str(p), "score": score, "size": list(z["imgsize"])})
    except Exception as e:
        pass
leads.sort(key=lambda x: -x["score"])
Path(OUT / "leads.jsonl").write_text("\n".join(json.dumps(l) for l in leads))
print(json.dumps({
    "scored": len(leads),
    "score_gt_0_5": sum(1 for l in leads if l["score"] > 0.5),
    "score_gt_0_8": sum(1 for l in leads if l["score"] > 0.8),
}, indent=2))
PY

echo "[$(date -u +%H:%M:%S)] done -> $OUT/leads.jsonl"
