# Image-forensics (Pipeline A)

Within-corpus scientific-image duplication detection. Off-the-shelf libraries; no giant
external database required for the David-style (one lab's own figures) use case.

## Modules
- `detector.py` — whole-panel pHash + cross-image ORB/RANSAC (rotation/scale/crop invariant).
- `forensics.py` — **intra-image copy-move** (region cloned within one panel) + **ELA**
  splice hint. The single-image techniques ImageTwin/Proofig apply.
- `advanced_detector.py` — `detector.scan` **+ flip-invariant** ORB pass (mirrored region
  reuse, which plain homography misses).
- `stress_test.py` — synthetic benchmark: recall across manipulation types + false-positive rate.
- `make_synthetic_test.py` — minimal planted-manipulation self-test.

```bash
pip install -r requirements.txt
python stress_test.py            # benchmark the full stack
python advanced_detector.py ...  # (import) cross-image incl. flips
python forensics.py <image>      # single-image copy-move + ELA
```

## Benchmark (stress_test.py, synthetic)
```
cross-image recall = 100% (5/5): exact dup, JPEG-recompressed, rotated splice,
                                 scaled splice, mirrored (flipped) splice
false-positive rate = 0% (0/6 unrelated clean pairs)
intra-image copy-move: cloned image fires; clean image = 0
```

## Where this sits vs ImageTwin
Algorithmically comparable for **single-corpus** detection (whole-panel, region reuse
incl. rotation/scale/crop/flip, and intra-image cloning). The remaining gap is
ImageTwin's **~150M-image cross-literature index** — a data/infra build (DINOv2/CLIP
embeddings + an ANN index over harvested open-access figures), not an algorithm gap.
See `../../docs/research-integrity/COST-AND-MOAT.md` for the cost of that index.

Not legal advice. Output is probable-cause signal for human review, never a fraud finding.
