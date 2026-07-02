# Existing image-integrity systems, and what we adopt

*Survey of the state of the art in scientific-image duplication detection, and a
concrete plan to adopt the open pieces rather than reinvent them. Not legal advice.*

## 1. The commercial leaders (closed, subscription)

| System | Corpus | Adopted by | Notes |
|---|---|---|---|
| **ImageTwin** | 160M+ published figures | ASM journals (1-yr pilot 2023, then integrated) | Strong across figure types; best at microscopy duplication; cross-literature index is the moat. |
| **Proofig AI** | 155M+ PubMed open-source images | *Science* / AAAS (early 2025) | Better on western blots with fewer false positives than ImageTwin; slower; small non-PubMed DB. |
| **STM Integrity Hub** | publisher-shared signals | STM publisher consortium | Aggregates integrity signals (incl. image) across members pre-publication. |

Take-away: the algorithms are not secret. **The moat is corpus size + a maintained
cross-literature index**, exactly what our `embedding_index.py` implements in miniature.
Both leaders are essentially "embed every published panel, ANN-search new panels" —
which is our architecture. We close the gap with data (harvesting), not new math.

## 2. Open datasets and research to adopt (verified live via GitHub)

| Resource | What | Use for us |
|---|---|---|
| **BioFors** (ICCV 2021) | 39,423 real biomedical images, ground-truth for 3 tasks: external duplication, internal duplication, cut/sharp-transition | **Our real benchmark** — replace the synthetic stress test's ground truth; report recall/FP on BioFors. |
| **polimi-ispl western-blot synthetic manipulation** (WIFS 2024) | genuine blots + GAN/DALL·E/GIMP manipulations + masks | Blot-specific + AI-generated-patch test set; hard low-texture cases. |
| **SILA** (Sci. Reports 2022) | system for scientific image analysis | Reference pipeline for panel handling. |
| **DINOv2** (Meta, open weights) | self-supervised image embeddings | **Already wired** as the `embedding_index.py` "deep" backend; best-in-class retrieval, crop-robust. |
| **CLIP** (open) | image embeddings | Alternate/ensemble backend. |

## 3. Live proof our pipeline runs on real images (done in-sandbox)

The dev sandbox blocks every data API, but GitHub raw is reachable, so
`services/image-forensics/live_run.py` fetched **real images over the live network**
(scikit-image biomedical set: `cell.png` microscopy, `retina.jpg`, `microaneurysms.png`;
plus OpenCV samples) and ran the full pipeline. Result (5/5):

- **Cross-figure reuse:** a laundered copy of the real `cell.png` microscopy image
  (JPEG recompress → 0.8× rescale → mirror) was retrieved as the **top hit at cosine
  0.996**, while an unrelated real image sat at 0.506 — clean separation.
- **Intra-image copy-move:** a duplicated region was caught at **score 100** on a
  textured real image, with **zero** false positive on the untouched original.
- **Honest limitation surfaced:** ORB copy-move needs texture; smooth microscopy/blots
  yield too few keypoints (the documented hard case — blots "lack distinctive texture").
  That path is covered by the embedding/block methods, not ORB — see §4.

Reproduce:
```bash
mkdir live && cd live
base=https://raw.githubusercontent.com
curl -sO $base/scikit-image/scikit-image/v0.24.0/skimage/data/cell.png
curl -sO $base/scikit-image/scikit-image/v0.24.0/skimage/data/retina.jpg
for n in baboon.jpg board.jpg lena.jpg fruits.jpg; do curl -sO $base/opencv/opencv/master/samples/data/$n; done
cd .. && python services/image-forensics/live_run.py ./live
```

## 4. Adoption plan (ordered)

1. **Benchmark on BioFors, not synthetic.** Wire a BioFors loader; report external- and
   internal-duplication recall + false-positive rate. This is the credible metric to
   show DOJ/FOCUS and journals (our current 100%/0-FP is on synthetic data only).
2. **Turn on the DINOv2 backend in production.** Already pluggable; `pip install torch`
   and the index auto-upgrades. Gains crop robustness (the ORB shortlist stays as the
   geometric confirmer).
3. **Add a block/PatchMatch copy-move path** for low-texture panels (the ORB gap proven
   live above), so smooth blots/microscopy are covered without ORB keypoints.
4. **Build the funded-paper corpus** (the actual ask): harvest the PMC / Europe PMC
   open-access subset filtered by US funder and index every panel —
   `harvest_figures.py 'GRANT_AGENCY:"NIH" AND OPEN_ACCESS:y'` (also NSF, DOD, DOE).
   This is a large but bounded ingest; run it incrementally on a networked machine
   (see `TERMINAL-CLAUDE-RUNBOOK.md`). That corpus is what turns our miniature index
   into an ImageTwin-class cross-literature checker for American-funded research.
5. **Keep the confirmer + human-in-the-loop.** Index hit → ORB/RANSAC geometric confirm
   → human review. A retrieval hit is a lead, never a finding.

## Sources

- ASM × Imagetwin: [mBio 2025](https://journals.asm.org/doi/10.1128/mbio.01990-25) / [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12505991/); [Imagetwin](https://imagetwin.ai/product)
- Proofig × Science: [proofig.com](https://www.proofig.com/); tool comparison: [KnowledgeWorks](https://www.kwglobal.com/blog/ensuring-research-integrity/)
- [BioFors dataset (ICCV 2021)](https://openaccess.thecvf.com/content/ICCV2021/papers/Sabir_BioFors_A_Large_Biomedical_Image_Forensics_Dataset_ICCV_2021_paper.pdf)
- [polimi-ispl western-blot synthetic manipulation (WIFS 2024)](https://github.com/polimi-ispl/western-blot-synthetic-manipulation-localization) / [arXiv 2408.13786](https://arxiv.org/pdf/2408.13786)
- [SILA: a system for scientific image analysis (Sci. Reports 2022)](https://www.nature.com/articles/s41598-022-21535-3)
