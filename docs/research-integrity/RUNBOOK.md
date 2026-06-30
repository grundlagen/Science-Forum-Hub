# Runbook — running the scanners on a terminal

Quick start (verifies everything offline, prints live commands):

```bash
git fetch origin && git checkout claude/building-thoughts-r6ghup
bash scripts/ri-bootstrap.sh
```

> Every result is **probable cause for human review, not a finding of fraud**. Each case
> package has an **Ethics & handling** section (entity scale, proportionality, "consider
> notifying first" for small/individual/public-benefit subjects). **Not legal advice.**

## Domains, data sources, and commands

### 1. Research integrity — undisclosed foreign funding (NIH × OpenAlex)
No data files; needs network to `api.reporter.nih.gov` + `api.openalex.org`.
```bash
OPENALEX_MAILTO=you@example.org \
pnpm --filter @workspace/extrapolator run detect-foreign-funding -- "Qing Wang" --funders
```

### 2. General federal funding — debarred recipients (USASpending × SAM)
- **SAM Exclusions Extract** (public CSV, no key): sam.gov → Data Services → "Exclusions Public Extract".
- Needs network to `api.usaspending.gov`.
```bash
pnpm --filter @workspace/extrapolator run scan-recipient -- "Some Recipient Inc" \
  --exclusions /path/to/SAM_Exclusions_Public_Extract.csv
```

### 3. Healthcare — excluded providers still billing (CMS × OIG LEIE)
- **LEIE CSV** (public, no key): oig.hhs.gov → Exclusions → "Downloadable Databases" → `UPDATED LEIE` CSV.
- **CMS dataset id**: data.cms.gov → "Medicare Part D Prescribers - by Provider" → copy the current release's dataset id.
- Needs network to `data.cms.gov`.
```bash
pnpm --filter @workspace/extrapolator run scan-provider -- \
  --npi 1234567890 --leie /path/to/LEIE.csv --cms-dataset <datasetId> --year 2022 \
  --scale small --public-benefit "free clinic for uninsured"   # optional ethics hints
```

## Whistleblower programs covered (see `lib/extrapolator/src/programs.ts`)
FCA (qui tam), SEC, CFTC, IRS, FinCEN/AML, state FCAs — with reward bands and the
domains each covers. `programsForDomain(domain)` and `estimateReward(program, recovery)`
drive the reward figures shown in case packages.

## Offline self-tests (no network)
```bash
pnpm --filter @workspace/extrapolator run verify-programs
pnpm --filter @workspace/extrapolator run verify-debarred
pnpm --filter @workspace/extrapolator run verify-excluded-provider
pnpm --filter @workspace/extrapolator run verify-certification
pnpm --filter @workspace/extrapolator run verify-case-package
```

## Persisting results (optional)
```bash
pnpm --filter @workspace/db run push          # create the ri_* tables
DATABASE_URL=... pnpm --filter @workspace/extrapolator run seed-ground-truth
```

## Adding a new domain
Add a connector under `lib/integrations/<source>`, a pure detector under
`lib/extrapolator/src/detectors/<name>.ts` returning `DetectorSignal`s (with a `domain`),
and the rest of the pipeline (program mapping, reward, ethics triage, case package) is
automatic. Wire the package into the two `tsconfig.json` reference lists.
