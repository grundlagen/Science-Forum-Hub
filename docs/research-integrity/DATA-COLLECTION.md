# Data collection: bulk sources and how to harvest them

*Runbook for filling the pipeline with real data. All sources are public. Run
downloads on your own machine (the dev sandbox blocks API egress). Not legal advice.*

## 1. Bulk files (download once, parse with the pure connectors)

| Source | What | Where | Connector |
|---|---|---|---|
| SBA PPP FOIA | Every PPP loan: borrower, address, amounts, jobs, lender | data.sba.gov/dataset/ppp-foia (CSV, ~1GB total) | `@workspace/integration-sba-ppp` -> `detectors/pppAnomaly.ts` |
| SAM.gov Exclusions Extract | All debarred/excluded parties | sam.gov Data Services (CSV, daily) | `@workspace/integration-sam-exclusions` -> debarred detectors |
| OIG LEIE | Healthcare-excluded providers | oig.hhs.gov/exclusions (CSV, monthly) | `@workspace/integration-oig-leie` -> excluded-provider detector |
| NIH ExPORTER | All NIH grants + publication links, bulk | reporter.nih.gov/exporter (CSV/zip, yearly files) | feeds the same shapes as the RePORTER client |
| USASpending downloads | Full award + sub-award archives | usaspending.gov/download_center | `@workspace/integration-usaspending` shapes |
| OpenAlex snapshot | Whole scholarly graph (works/authors/institutions) | openalex.org snapshot (S3, ~300GB) | `@workspace/integration-openalex` shapes |
| CMS datasets | Utilization/payment by provider (Part B/D etc.) | data.cms.gov (API + CSV) | `@workspace/integration-cms` |
| OCDS releases | Bid-level procurement, 50+ countries | per-publisher (e.g. Colombia, UK, Ukraine) | `@workspace/integration-ocds` -> `detectors/bidRigging.ts` |
| State DOT bid lettings | US bid-level results (winner + losers) per letting | each state DOT posts letting results | shape into `Tender` for `detectors/bidRigging.ts` |

Notes:
- **Bid-level US federal data is not centralized.** USASpending shows winners only.
  Rotation/CV/RD screens need loser bids, which state DOTs publish per letting —
  scrape per state; OCDS covers many non-US countries out of the box.
- **PPP file quirks:** jobs fields can be blank/0 legitimately; `pppAnomaly` already
  demands margin (1.5x the per-job cap) and skips blanks. Keep it that way.

## 2. Figure corpus for the image index (the ImageTwin gap)

The algorithm stack is done (pHash, ORB/RANSAC, flips, copy-move, panels,
embeddings). What ImageTwin has that we don't is a ~150M-figure corpus. Build ours:

```bash
cd services/image-forensics
# harvest open-access figures (Europe PMC, no key; be polite, it sleeps between calls)
python harvest_figures.py 'GRANT_AGENCY:"NIH" AND OPEN_ACCESS:y' ./corpus 5000
# panel-split + embed + persist
python embedding_index.py build ./corpus ./corpus_index
# query any suspect panel against the whole corpus
python embedding_index.py query ./corpus_index suspect_panel.png
```

Scale math: 256-dim float32 per panel ≈ 1KB -> 1M panels ≈ 1GB RAM (exact cosine,
no FAISS needed until ~10M). The harvest, not the search, is the long pole — run it
incrementally per journal/funder/lab as cases demand. If torch is installed the
index automatically upgrades to DINOv2 embeddings (better crop robustness);
indexes are backend-tagged so you can't mix them by accident.

Confirmation flow (always): index hit -> ORB/RANSAC confirm (`detector.py`) ->
human review. A retrieval hit is a lead, never a finding.

## 3. Verify suites covering the new collectors/detectors

```bash
pnpm --filter @workspace/extrapolator run verify-ppp              # PPP parser + anomalies
pnpm --filter @workspace/extrapolator run verify-copied-test-data # Kokosing pattern
pnpm --filter @workspace/extrapolator run verify-bid-rigging      # CV/RD/rotation screens
pnpm --filter @workspace/extrapolator run verify-pass-through     # DBE front indicators
pnpm --filter @workspace/extrapolator run verify-fabrication      # GRIM/Benford/terminal-digit
python services/image-forensics/index_test.py                     # panel index benchmark
```
