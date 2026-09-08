# Procurement document-workshop screening

This tool extracts low-level provenance fingerprints from PDF, DOCX and XLSX/XLSM bid files and ranks candidate common-origin pairs using corpus rarity.

A high score is **not evidence of collusion**. Before promotion, falsify common solicitation templates, e-procurement portal re-rendering, agency-side scanning/recombination, common consultants, disclosed joint ventures/partners, shared subcontractors, and ordinary Microsoft/Adobe defaults.

## Run

```bash
python -m pip install -r tools/procurement/requirements.txt
python tools/procurement/document_workshop_fingerprinter.py /path/to/bid/corpus --out fingerprints.json --pairs 0.18
```

PDF signals include creator/producer/author metadata, page geometry, embedded fonts and rare subset prefixes, embedded-JPEG quantisation hashes and linguistic shingles. DOCX signals include author/last-modifier, styles/theme, attached template, RSIDs and ZIP timestamp patterns. XLSX/XLSM signals include creator/last-modifier, styles, hidden/defined names, formula skeletons and ZIP timestamp patterns.

Signals are weighted by inverse corpus prevalence so ubiquitous Office/PDF defaults contribute little while rare features shared by nominally independent bidders contribute more.

A useful prospectus records the tender and bidders; raw-file provenance; anomaly; independent corroboration; innocent explanations tested; award/payment trail; legal theory if any; public-disclosure/first-to-file issues if relevant; and missing evidence.
