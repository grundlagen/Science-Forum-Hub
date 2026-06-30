# Image-forensics PoC (Pipeline A)

A working proof that within-corpus scientific-image duplication detection is **not**
algorithmically hard. ~150 lines, off-the-shelf libraries.

- `detector.py` — pHash (whole-panel near-dupes) + ORB/RANSAC (region reuse that is
  rotation/scale/crop invariant). Ranked signals for human review.
- `make_synthetic_test.py` — plants two known manipulations and verifies detection.

```bash
pip install -r requirements.txt
python make_synthetic_test.py          # self-test with planted duplications
python detector.py <folder-of-panels>  # run on real extracted figure panels
```

Demonstrated result (synthetic):
```
[phash     ] score=100.00  dup_of_a.png       <-> panel_a.png         (hamming=0)
[orb+ransac] score=100.00  dup_of_a.png       <-> panel_a.png         (349 matches)
[orb+ransac] score= 60.00  panel_b.png        <-> spliced_from_b.png  (60 matches, rotation/scale/crop invariant)
```

## What this PoC does NOT yet do (the actual work)
1. **Figure → panel segmentation** (split multi-panel figures into cells). The real
   accuracy bottleneck; needs a layout model.
2. **Cross-literature search.** Same primitives + an ANN index (FAISS / pgvector /
   Qdrant) over embeddings (DINOv2/CLIP) of tens of millions of panels. See
   `../../docs/research-integrity/COST-AND-MOAT.md` for the cost of that.
3. **Splice/seam + ELA detectors**, and validation against the ground-truth set.

Not legal advice. Output is probable-cause signal for human review, never a fraud finding.
