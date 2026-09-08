# Calibration run — 2026-09-08

Seven synthetic files produced three candidate pairs at threshold 0.18. The planted PDF pair survived rarity weighting at about 0.27. The DOCX and XLSX planted pairs were byte-identical because the deterministic generator emitted identical containers; treat that as a generator defect, not nuanced validation. No control file exceeded threshold.

Next revision should vary benign timestamps/content while preserving selected rare provenance features and assert ranking rather than exact scores.
