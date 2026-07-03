# =====================================================================
# Research-integrity paper deep-search — ONE Colab cell (drop in & run)
# ---------------------------------------------------------------------
# Prereqs (do these ONCE, they are why the old cell got stuck on stale code):
#   1. Runtime -> Change runtime type -> GPU (T4 or L4).
#   2. Click the 🔑 padlock (Secrets) in the left sidebar and add, with
#      "Notebook access" toggled ON for each:
#        GITHUB_PAT        fine-grained PAT, contents:write on
#                          grundlagen/science-forum-hub  (REQUIRED — without a
#                          real one the loop runs old cached code and can't push)
#        OPENROUTER_API_KEY   (recommended) enables real self-edits, any model
#        GOOGLE_API_KEY       (alternative to OpenRouter)
#   Do NOT paste secrets into this cell. This cell reads them from Secrets.
# =====================================================================
from google.colab import drive, userdata
drive.mount('/content/drive')
import os, subprocess

BRANCH   = 'claude/building-thoughts-r6ghup'
REPO     = 'grundlagen/science-forum-hub'
REPO_DIR = '/content/drive/MyDrive/science-forum-hub'      # persists on your 5TB Drive

def _secret(name):
    try:
        return (userdata.get(name) or '').strip()
    except Exception:
        return ''

PAT = _secret('GITHUB_PAT') or _secret('GITHUB_TOKEN')
if PAT in ('', 'YOUR_PAT', 'YOUR_TOKEN'):
    raise SystemExit(
        "STOP: no real GITHUB_PAT in Colab Secrets (padlock icon).\n"
        "Add a fine-grained PAT with contents:write on " + REPO + ", toggle "
        "Notebook access ON, then re-run. A placeholder is exactly what made the "
        "loop run stale Drive code and look 'stuck'.")

os.environ['GITHUB_PAT'] = PAT
for k in ('OPENROUTER_API_KEY', 'GOOGLE_API_KEY'):
    v = _secret(k)
    if v:
        os.environ[k] = v

# ---- run config (tune later) ----
os.environ['PYTHON_ONLY']  = '1'     # skip the flaky Node/pnpm toolchain
os.environ['BACKGROUND']   = '1'     # detached: cell returns, streams to Drive
os.environ['HARVEST_N']    = '400'   # completes an iteration in minutes; raise
                                     # to a few thousand once you see it produce
                                     # leads + STATUS.md (your 5TB Drive holds it)
os.environ['BUDGET_HOURS'] = '8'

# ---- force the Drive clone to LATEST code, then launch ----
AUTH = f"https://x-access-token:{PAT}@github.com/{REPO}.git"
if os.path.isdir(REPO_DIR + '/.git'):
    subprocess.run(['git', '-C', REPO_DIR, 'remote', 'set-url', 'origin', AUTH])
    subprocess.run(['git', '-C', REPO_DIR, 'fetch', 'origin', BRANCH, '-q'])
    subprocess.run(['git', '-C', REPO_DIR, 'reset', '--hard', f'origin/{BRANCH}', '-q'])
else:
    subprocess.run(['git', 'clone', '--branch', BRANCH, AUTH, REPO_DIR])

os.system(f'bash {REPO_DIR}/services/autonomy/colab_bootstrap.sh')
print("\nLaunched (detached). Nothing to watch here — it streams to Drive:")
print("  /content/drive/MyDrive/Research_Integrity_Runs/console.log")
print("  /content/drive/MyDrive/Research_Integrity_Runs/STATUS.md")
print("Your supervising Claude session reads those every hour and auto-fixes.")
