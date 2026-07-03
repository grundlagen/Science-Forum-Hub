#!/usr/bin/env bash
# One-shot "big beast" bootstrap for Colab Pro. Clones/updates the repo, installs
# everything, verifies output persistence + GPU + network LOUDLY, then launches the
# autonomous deep scan with output streamed to screen AND saved to Drive.
#
# DO NOT launch this via `curl raw.githubusercontent.com | bash` for a private repo —
# GitHub's raw content endpoint needs its OWN auth and a URL-embedded PAT does not work
# there (you'll get "404: command not found" as bash tries to execute the 404 body).
# Always CLONE FIRST with git (which does accept a URL-embedded PAT), then run this
# script from the local checkout:
#   !git clone --branch claude/building-thoughts-r6ghup \
#       https://x-access-token:$GITHUB_PAT@github.com/grundlagen/science-forum-hub.git
#   !bash science-forum-hub/services/autonomy/colab_bootstrap.sh
# (See docs/research-integrity/AUTONOMOUS-SPEC.md for the full, copy-paste Colab cells.)
#
# Required env (set BEFORE running, e.g. via google.colab.userdata):
#   GITHUB_PAT or GITHUB_TOKEN   fine-grained token, contents:write on this repo ONLY
#   OPENROUTER_API_KEY   (recommended) enables real self-edits via any top coding model
# Optional env:
#   BRANCH (default claude/building-thoughts-r6ghup)
#   HARVEST_QUERY, HARVEST_N, BUDGET_HOURS, PYTHON_ONLY, NO_PUSH, NO_EDIT, BACKGROUND
set -uo pipefail

BRANCH="${BRANCH:-claude/building-thoughts-r6ghup}"
REPO="grundlagen/science-forum-hub"
DRIVE="/content/drive/MyDrive/Research_Integrity_Runs"
# Deep scan across the major US funders by default.
HARVEST_QUERY="${HARVEST_QUERY:-(GRANT_AGENCY:\"NIH\" OR GRANT_AGENCY:\"National Science Foundation\" OR GRANT_AGENCY:\"Department of Defense\" OR GRANT_AGENCY:\"Department of Energy\") AND OPEN_ACCESS:y}"
# 3000 made a single iteration run >1h and never return (it hit the pipeline timeout
# and killed the loop before any STATUS.md/leads were written). 400 completes an
# iteration in minutes so leads + STATUS.md actually get produced; raise it later.
HARVEST_N="${HARVEST_N:-400}"
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
# Accept either secret name; empty = try a public (no-token) clone.
TOKEN="${GITHUB_PAT:-${GITHUB_TOKEN:-}}"
if [ -n "$TOKEN" ]; then
  AUTH_URL="https://x-access-token:${TOKEN}@github.com/${REPO}.git"
else
  echo "no GITHUB_PAT/GITHUB_TOKEN set — using public (no-token) clone; push will be disabled"
  AUTH_URL="https://github.com/${REPO}.git"; export NO_PUSH=1
fi
# Persist on Drive if writable, else local /content.
if [ -n "${RI_RUNS_DIR:-}" ]; then REPO_DIR="$(dirname "$RI_RUNS_DIR")/science-forum-hub"; else REPO_DIR="/content/science-forum-hub"; fi

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "cloning into $REPO_DIR ..."
  if ! git clone --branch "$BRANCH" "$AUTH_URL" "$REPO_DIR"; then
    echo "CLONE FAILED. Most common causes:"
    echo "  - fine-grained PAT: must grant access to the '${REPO%%/*}' org AND select this repo (org may need to approve it)"
    echo "  - classic PAT: needs the 'repo' scope"
    echo "  - or make the repo public and re-run with no token"
    exit 1
  fi
else
  echo "reusing existing repo at $REPO_DIR (injected from Drive)"
fi
cd "$REPO_DIR" || exit 1
git remote set-url origin "$AUTH_URL"
git config user.email "colab-runner@example.org"; git config user.name "colab-runner"
git fetch origin "$BRANCH" -q && git checkout "$BRANCH" -q
if ! git pull --rebase origin "$BRANCH" -q; then
  echo "pull --rebase blocked (dirty working tree from a prior session) — committing any"
  echo "real progress first, then retrying:"
  git add -A
  git commit -q -m "colab: snapshot before pull $(date -u +%FT%TZ)" 2>/dev/null || true
  git rebase --abort 2>/dev/null || true
  if ! git pull --rebase origin "$BRANCH" -q; then
    echo "still blocked — discarding local diffs and re-pulling clean (Drive copy is a"
    echo "cache, not the source of truth; nothing here was unpushed since the commit above)"
    git reset --hard "origin/$BRANCH" -q || echo "pull failed — continuing on the local Drive copy"
  fi
fi

say "3/6 Install dependencies"
pip -q install opencv-python-headless imagehash pillow numpy faiss-cpu torch torchvision >/dev/null 2>&1
# NOTE: `google-generativeai` is EOL (Colab itself prints a deprecation notice for it).
# The self-edit backends use OPENROUTER_API_KEY (recommended, one key/any model) or the
# new `google-genai` package — see self_edit.py. Do not hand-install google-generativeai.
[ -n "${GOOGLE_API_KEY:-}" ] && pip -q install google-genai >/dev/null 2>&1
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

say "6/6 Launch autonomous deep scan"
LOG="${RI_RUNS_DIR:-$PWD/services/image-forensics/runs}/console.log"
mkdir -p "$(dirname "$LOG")"
cd services/autonomy
FLAGS=""; [ "${PYTHON_ONLY:-0}" = "1" ] && FLAGS="$FLAGS --python-only"
[ "${NO_PUSH:-0}" = "1" ] && FLAGS="$FLAGS --no-push"
[ "${NO_EDIT:-0}" = "1" ] && FLAGS="$FLAGS --no-edit"

if [ "${BACKGROUND:-0}" = "1" ]; then
  # Detached: the cell returns immediately. No background THREAD calling any Colab AI
  # hook (that crashes per Colab's own runtime) — this is a separate OS PROCESS, which
  # is safe. Check progress any time with a fresh, cheap cell (see AUTONOMOUS-SPEC.md
  # "check status" cell) instead of hand-rolling a log-tailing thread.
  nohup stdbuf -oL -eL python -u orchestrator.py \
    --branch "$BRANCH" $FLAGS \
    --harvest "$HARVEST_QUERY" --harvest-n "$HARVEST_N" \
    --budget-hours "$BUDGET_HOURS" --max-iterations 50 --patience 5 \
    > "$LOG" 2>&1 &
  echo "Launched in background, PID $!. Live log: $LOG"
  echo "Re-run a status cell any time: !tail -n 60 $LOG"
else
  echo "Live log: $LOG   (STATUS.md updates every iteration; this cell BLOCKS until the run ends)"
  stdbuf -oL -eL python -u orchestrator.py \
    --branch "$BRANCH" $FLAGS \
    --harvest "$HARVEST_QUERY" --harvest-n "$HARVEST_N" \
    --budget-hours "$BUDGET_HOURS" --max-iterations 50 --patience 5 \
    2>&1 | tee -a "$LOG"
fi
