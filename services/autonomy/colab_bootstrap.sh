#!/usr/bin/env bash
# One-shot "big beast" bootstrap for Colab Pro. Clones/updates the repo, installs
# everything, verifies output persistence + GPU + network LOUDLY, then launches the
# autonomous deep scan with output streamed to screen AND saved to Drive.
#
# Usage in a Colab cell:
#   !bash <(curl -sSL https://raw.githubusercontent.com/grundlagen/science-forum-hub/claude/building-thoughts-r6ghup/services/autonomy/colab_bootstrap.sh)
# or, if already cloned:  !bash services/autonomy/colab_bootstrap.sh
#
# Required env (set BEFORE running):
#   GITHUB_PAT   fine-grained token, contents:write on this repo ONLY
#   GOOGLE_API_KEY   (optional) enables the Gemini self-edit backend
# Optional env:
#   BRANCH (default claude/building-thoughts-r6ghup)
#   HARVEST_QUERY, HARVEST_N, BUDGET_HOURS
set -uo pipefail

BRANCH="${BRANCH:-claude/building-thoughts-r6ghup}"
REPO="grundlagen/science-forum-hub"
DRIVE="/content/drive/MyDrive/Research_Integrity_Runs"
# Deep scan across the major US funders by default.
HARVEST_QUERY="${HARVEST_QUERY:-(GRANT_AGENCY:\"NIH\" OR GRANT_AGENCY:\"National Science Foundation\" OR GRANT_AGENCY:\"Department of Defense\" OR GRANT_AGENCY:\"Department of Energy\") AND OPEN_ACCESS:y}"
HARVEST_N="${HARVEST_N:-3000}"
BUDGET_HOURS="${BUDGET_HOURS:-8}"

say() { echo -e "\n\033[1;36m>>> $*\033[0m"; }

say "1/6 Drive persistence check"
if [ -d /content/drive/MyDrive ]; then
  mkdir -p "$DRIVE"
  if echo "ok $(date)" > "$DRIVE/.probe" && cat "$DRIVE/.probe" >/dev/null; then
    rm -f "$DRIVE/.probe"; export RI_RUNS_DIR="$DRIVE"
    echo "Drive writable -> results persist to $DRIVE"
  else
    echo "WARNING: Drive present but not writable — results will be local only"
  fi
else
  echo "WARNING: Drive not mounted. Run drive.mount('/content/drive') first, or results won't survive."
fi

say "2/6 Clone or update repo (kept ON DRIVE so it persists + avoids re-cloning)"
# If Drive is writable, keep the repo there so a new session reuses it (no re-clone,
# no re-install). Otherwise fall back to a local /content clone.
if [ -n "${RI_RUNS_DIR:-}" ]; then
  REPO_DIR="$(dirname "$RI_RUNS_DIR")/science-forum-hub"
else
  REPO_DIR="/content/science-forum-hub"
fi
if [ ! -d "$REPO_DIR/.git" ]; then
  echo "cloning into $REPO_DIR ..."
  git clone --branch "$BRANCH" "https://x-access-token:${GITHUB_PAT}@github.com/${REPO}.git" "$REPO_DIR"
else
  echo "reusing existing repo at $REPO_DIR (injected from Drive)"
fi
cd "$REPO_DIR" || exit 1
git remote set-url origin "https://x-access-token:${GITHUB_PAT}@github.com/${REPO}.git"
git config user.email "colab-runner@example.org"; git config user.name "colab-runner"
git fetch origin "$BRANCH" -q && git checkout "$BRANCH" -q && git pull --rebase origin "$BRANCH" || echo "pull had conflicts — continuing on local state"

say "3/6 Install dependencies"
pip -q install opencv-python-headless imagehash pillow numpy faiss-cpu torch torchvision >/dev/null 2>&1
[ -n "${GOOGLE_API_KEY:-}" ] && pip -q install google-generativeai >/dev/null 2>&1
if [ "${PYTHON_ONLY:-0}" = "1" ]; then
  echo "PYTHON_ONLY=1 -> skipping Node/pnpm (the part that was struggling). The loop will"
  echo "run + self-edit the Python scan code, gated by the image benchmarks + invariant guard."
else
  npm i -g pnpm >/dev/null 2>&1 && pnpm install || { echo "pnpm install FAILED — re-run with PYTHON_ONLY=1 to skip it"; }
fi

say "4/6 PREFLIGHT (fails loudly if anything is broken)"
python -u services/autonomy/preflight.py --runs-dir "${RI_RUNS_DIR:-}" || { echo "PREFLIGHT FAILED — stopping."; exit 1; }

say "5/6 Offline sanity (deterministic logic)"
python -u services/autonomy/selftest.py || { echo "SELFTEST FAILED — stopping."; exit 1; }

say "6/6 Launch autonomous deep scan (streaming + saving to Drive)"
LOG="${RI_RUNS_DIR:-services/image-forensics/runs}/console.log"
mkdir -p "$(dirname "$LOG")"
echo "Live log: $LOG   (STATUS.md updates every iteration)"
cd services/autonomy
PYFLAG=""; [ "${PYTHON_ONLY:-0}" = "1" ] && PYFLAG="--python-only"
# -u = unbuffered so Colab shows output live; tee = also persist to Drive.
stdbuf -oL -eL python -u orchestrator.py \
  --branch "$BRANCH" $PYFLAG \
  --harvest "$HARVEST_QUERY" --harvest-n "$HARVEST_N" \
  --budget-hours "$BUDGET_HOURS" --max-iterations 50 --patience 5 \
  2>&1 | tee -a "$LOG"
