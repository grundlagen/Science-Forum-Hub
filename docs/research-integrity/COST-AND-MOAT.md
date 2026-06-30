# Image detection: is it really a moat? — corrected analysis + costs

## Short answer: "moat" was overstated. Honest version below.

| Layer | Hard? | Reality |
|---|---|---|
| **Algorithm** | No | pHash + ORB/RANSAC in ~150 LOC catches whole-panel + rotated/scaled/spliced region reuse (see `services/image-forensics`). Deep embeddings (DINOv2/CLIP) are equally off-the-shelf. |
| **Corpus / data** | No (open access) | **PMC Open Access Subset is free + bulk-downloadable** (AWS Open Data + NIH FTP), CC-licensed, figures included — millions of articles. bioRxiv/Europe PMC add more. |
| **Panel segmentation** | Somewhat | Splitting multi-panel figures into cells is the real *accuracy* bottleneck; needs a layout model. |
| **Cross-literature scale** | Engineering, not magic | Embedding + ANN-indexing 50–150M panels and keeping it fresh. Bounded infra cost (below). |
| **Non-OA coverage + trust** | ImageTwin's real edge | Paywalled/publisher figures + established-vendor trust. Hard to replicate; also *not needed* for within-corpus David model. |

**Conclusion:** the moat is ingestion + segmentation + non-OA coverage, not a secret algorithm or unobtainable data. For targeted David-style use (one lab's own figures), none of the expensive parts are required.

## Build cost — TEST scale (recommended start)
~100k–500k OA articles → ~1.5–7.5M panels.
- Download: **free** (AWS Open Data / PMC FTP).
- Storage: ~0.3–1.5 TB → S3 **~$7–35/mo** (or local, $0).
- pHash: CPU → **effectively free**.
- Optional embeddings (DINOv2): a few GPU-hours → **~$5–20 one-time** (spot).
- Vector index: **pgvector on the existing Postgres**, or local FAISS → **$0 extra**.
- **Realistic start: ~$10–50/month, or near-zero.**

## Build cost — FULL cross-literature scale
~5–7M OA articles → ~50–150M panels.
- Storage: ~5–10 TB → **~$120–250/mo** (S3).
- One-time embedding pass: ~100–300 GPU-hours → **~$150–600** (spot).
- ANN index: self-hosted FAISS/Qdrant big-RAM VM **~$200–800/mo**, or managed
  (Pinecone/Qdrant Cloud) ~100M vectors **~$ hundreds–low-thousands/mo**
  (HNSW / product-quantization cuts cost a lot).
- **Order: ~$300–1,500/month + ~$200–600 one-time.** A line item, not a moat.

## Buy alternative — ImageTwin / Proofig (to test the buy path)
Hard public dollar figures are **not posted** — both tiered / "contact sales":
- **ImageTwin** (https://imagetwin.ai/pricing): subscription scan-limits, or pay-per-scan / bundles, 12-month validity; custom institutional pricing.
- **Proofig** (https://www.proofig.com/pricing-page/): priced per **sub-image**; yearly packages.
- Cheapest evaluation: request a **trial**, run on known-positive retracted papers, measure recall vs the open-source detector.

## Recommendation
1. Build the within-corpus detector (PoC) — free, explainable (FOCUS plus), sufficient for David-style cases.
2. Validate recall against ground-truth papers.
3. Add panel segmentation next (biggest accuracy win).
4. Pay for ImageTwin only if/when broad cross-literature coverage is needed — build the OA index first, treat ImageTwin as augmentation.

*Order-of-magnitude planning estimates (mid-2026 cloud pricing), not quotes.*
