#!/usr/bin/env bash
# Research-Integrity / qui-tam scanner — terminal bootstrap.
# Run from the repo root:  bash scripts/ri-bootstrap.sh
#
# Sets up the workspace, verifies every detector's logic offline, and prints how to
# run the live scanners. Safe to re-run.
set -euo pipefail

BRANCH="claude/building-thoughts-r6ghup"
FILTER="@workspace/extrapolator"

echo "==> Research-Integrity scanner bootstrap"
echo

if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  current="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  echo "==> git branch: $current (target: $BRANCH)"
  if [ "$current" != "$BRANCH" ]; then
    echo "    (run: git fetch origin && git checkout $BRANCH)"
  fi
fi

echo "==> pnpm install"
pnpm install

echo "==> typecheck"
pnpm run typecheck

echo "==> verifying detectors (offline)"
for t in verify-programs verify-debarred verify-excluded-provider verify-certification verify-case-package; do
  echo "--- $t ---"
  pnpm --filter "$FILTER" run "$t"
done

cat <<'EOF'

============================================================
ALL CHECKS PASSED. Live scanners (need network + data files):
============================================================

RESEARCH INTEGRITY (NIH/OpenAlex):
  pnpm --filter @workspace/extrapolator run detect-foreign-funding -- "Some PI Name" --funders
  pnpm --filter @workspace/extrapolator run slice -- --org "Dana-Farber Cancer Institute" --ror https://ror.org/02jzgtq86

GENERAL FEDERAL FUNDING (USASpending x SAM debarment):
  # download the public SAM Exclusions Extract CSV from sam.gov first
  pnpm --filter @workspace/extrapolator run scan-recipient -- "Some Recipient Inc" \
    --exclusions /path/to/SAM_Exclusions_Public_Extract.csv

HEALTHCARE (CMS x OIG LEIE exclusions):
  # download the public LEIE CSV from oig.hhs.gov first; get the current
  # "Medicare Part D Prescribers - by Provider" dataset id from data.cms.gov
  pnpm --filter @workspace/extrapolator run scan-provider -- \
    --npi 1234567890 --leie /path/to/LEIE.csv --cms-dataset <datasetId> --year 2022

Set OPENALEX_MAILTO=you@example.org for the polite pool.
Every result is PROBABLE CAUSE for human review — see the "Ethics & handling"
section in each case package. Not legal advice.
See docs/research-integrity/RUNBOOK.md for data sources.
EOF
