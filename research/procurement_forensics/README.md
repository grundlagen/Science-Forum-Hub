# Procurement forensics

Experimental lead-generation tools for public-procurement integrity research.

## Components

- `document_workshop_fingerprinter.py` — fingerprints PDF/DOCX/XLSX provenance and compares nominally independent submissions using rarity-weighted file/metadata features.
- `dot_bid_screen.py` — downloads public Oregon DOT bid-history workbooks and ranks repeated bidder pairs using co-bidding frequency, tiny bid gaps, L1/L2 recurrence, winner rotation, and line-item price correlation.
- `leads/` — evidence packets. A lead is an anomaly requiring falsification, not an allegation.

## Design rule

The system should rank **how difficult a pattern is to explain innocently**, not merely how unusual it looks. Common agency templates, portal conversion, shared consultants, common subcontractors, ordinary estimating software, regional market structure and corporate affiliation are explicit counter-hypotheses.

For document features, ubiquitous fingerprints should contribute almost no weight. Rare combinations repeated across nominal competitors and across multiple tenders should contribute more.

## Reproducible run

The `Procurement Forensics` GitHub Actions workflow downloads ODOT's public 2024–2026 bid-data archives and produces:

- `pair_screen.csv`
- `contract_screen.csv`
- `bids_normalized.csv`
- `summary.json`

as a workflow artifact.

The score is for triage only. It does not infer collusion.

## Evidence ladder

1. statistical / provenance anomaly
2. repeated cross-tender persistence
3. entity-resolution confirmation
4. explicit procurement rule/certification
5. independent corroboration (addresses, signatories, submission infrastructure, documents, communications where lawfully public)
6. innocent-explanation tests
7. only then: legal/materiality/original-source assessment
