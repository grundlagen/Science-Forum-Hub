#!/usr/bin/env bash
# Full multi-domain scan for one target. Runs every scanner whose required inputs you
# provide. Needs outbound network to the public APIs (NIH/OpenAlex/USASpending/CMS) and,
# for the debarment/exclusion screens, the public CSVs (SAM / OIG LEIE).
#
# Examples:
#   bash scripts/ri-fullscan.sh --pi "Qing Wang"
#   bash scripts/ri-fullscan.sh --org "Dana-Farber Cancer Institute" --ror https://ror.org/02jzgtq86
#   bash scripts/ri-fullscan.sh --recipient "Acme Corp" --exclusions ~/SAM_Exclusions.csv
#   bash scripts/ri-fullscan.sh --npi 1234567890 --leie ~/LEIE.csv --cms-dataset <id> --year 2022
set -euo pipefail
FILTER="@workspace/extrapolator"

PI=""; ORG=""; ROR=""; RECIPIENT=""; NPI=""; EXCL=""; LEIE=""; CMS=""; YEAR=""; SCALE=""; PUBLIC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --pi) PI="$2"; shift 2;;
    --org) ORG="$2"; shift 2;;
    --ror) ROR="$2"; shift 2;;
    --recipient) RECIPIENT="$2"; shift 2;;
    --npi) NPI="$2"; shift 2;;
    --exclusions) EXCL="$2"; shift 2;;
    --leie) LEIE="$2"; shift 2;;
    --cms-dataset) CMS="$2"; shift 2;;
    --year) YEAR="$2"; shift 2;;
    --scale) SCALE="$2"; shift 2;;
    --public-benefit) PUBLIC="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; shift;;
  esac
done

run() { echo; echo "==================================================================="; echo ">>> $*"; echo "==================================================================="; "$@" || echo "(scanner exited non-zero — see output above)"; }

if [ -z "$PI$ORG$RECIPIENT$NPI" ]; then
  cat <<'EOF'
Full scan — provide at least one target:
  --pi "<name>"                      research foreign-funding (NIH x OpenAlex)
  --org "<name>" [--ror <url>]       org -> grants -> works slice
  --recipient "<name>" [--exclusions <SAM.csv>]   federal awards + debarment + sub-awards
  --npi <NPI> --leie <LEIE.csv> --cms-dataset <id> [--year Y]   healthcare excluded-provider
Optional ethics hints: --scale small|large|individual  --public-benefit "note"
EOF
  exit 1
fi

# 1) Research integrity — undisclosed foreign funding
if [ -n "$PI" ]; then
  run pnpm --filter "$FILTER" run detect-foreign-funding -- "$PI" --funders
fi

# 2) Research org slice (grants -> works)
if [ -n "$ORG" ]; then
  if [ -n "$ROR" ]; then
    run pnpm --filter "$FILTER" run slice -- --org "$ORG" --ror "$ROR"
  else
    run pnpm --filter "$FILTER" run slice -- --org "$ORG"
  fi
fi

# 3) General federal funding — debarred recipient + sub-awards
if [ -n "$RECIPIENT" ]; then
  if [ -n "$EXCL" ]; then
    run pnpm --filter "$FILTER" run scan-recipient -- "$RECIPIENT" --exclusions "$EXCL"
    run pnpm --filter "$FILTER" run scan-subawards -- "$RECIPIENT" --exclusions "$EXCL"
  else
    run pnpm --filter "$FILTER" run scan-recipient -- "$RECIPIENT"
    run pnpm --filter "$FILTER" run scan-subawards -- "$RECIPIENT"
  fi
fi

# 4) Healthcare — excluded provider
if [ -n "$NPI" ]; then
  args=(--npi "$NPI")
  [ -n "$LEIE" ] && args+=(--leie "$LEIE")
  [ -n "$CMS" ] && args+=(--cms-dataset "$CMS")
  [ -n "$YEAR" ] && args+=(--year "$YEAR")
  [ -n "$SCALE" ] && args+=(--scale "$SCALE")
  [ -n "$PUBLIC" ] && args+=(--public-benefit "$PUBLIC")
  run pnpm --filter "$FILTER" run scan-provider -- "${args[@]}"
fi

echo
echo "Full scan complete. Every result is PROBABLE CAUSE for human review (see the"
echo "'Ethics & handling' section in each case package). Not legal advice."
