# Colab GPU run + GitHub-mediated self-editing loop

*How to run the image pipeline on a Colab GPU and iterate with an editor (me or any
LLM) using the repo as the shared bus. Not legal advice; outputs are leads for human
review.*

## Topology (why it's built this way)

There is no live socket from the editor's sandbox to your Colab. So we don't try —
**the GitHub branch is the message bus**:

```
  Colab (GPU)                          Editor (LLM/you)
  ─ pull branch                        ─ pull branch
  ─ run colab_run.py  ──push results──▶ ─ read results.json / .md
  ─ re-run          ◀──push code edits── ─ change thresholds/detectors
```

Each side only ever does `git pull` / `git push`. No MCP-to-Colab, no tunnels, nothing
to keep alive. The loop is durable across disconnects because state lives in the repo.

## Colab cells (paste in order)

**1. Setup + GPU check**
```python
!nvidia-smi -L
!git clone --branch claude/building-thoughts-r6ghup https://github.com/grundlagen/science-forum-hub.git
%cd science-forum-hub/services/image-forensics
!pip -q install opencv-python-headless imagehash pillow numpy faiss-cpu
!pip -q install torch torchvision   # DINOv2 backend; Colab already has CUDA torch
```

**2. Configure git identity + a token (so Colab can push results back)**
```python
!git config user.email "you@example.org"
!git config user.name  "colab-runner"
# store a fine-grained PAT with contents:write on this repo ONLY (never paste it in chat)
from getpass import getpass
tok = getpass("GitHub PAT: ")
!git remote set-url origin https://x-access-token:{tok}@github.com/grundlagen/science-forum-hub.git
```

**3. Run the pipeline (GPU DINOv2 + FAISS kick in automatically)**
```python
!python colab_run.py \
  --harvest 'GRANT_AGENCY:"NIH" AND OPEN_ACCESS:y' --harvest-n 300 \
  --corpus ./corpus --index ./corpus_index \
  --threshold 0.92 --confirm 100 --out runs/results.json
```
- DINOv2 runs on `cuda` when present (prints the device); the classic backend is the
  CPU fallback.
- FAISS turns on automatically past `FAISS_MIN` (2000) panels.
- `--harvest` is optional; drop it to re-scan an existing `./corpus`.

**4. Push results back for the editor to read**
```python
!git add runs/results.json runs/results.md
!git commit -m "colab run: $(date -u +%FT%TZ)"
!git pull --rebase origin claude/building-thoughts-r6ghup && git push origin HEAD:claude/building-thoughts-r6ghup
```

**5. Pull the editor's changes and re-run (the loop)**
```python
!git pull --rebase origin claude/building-thoughts-r6ghup
# then re-run cell 3
```

## What the editor reads and changes

- Reads `runs/results.json` (machine) + `runs/results.md` (human): panels indexed,
  articles, leads, ORB-confirmed count, and the ranked pairs.
- Tunes: `MATCH_THRESHOLD` / `FAISS_MIN` in `embedding_index.py`; ORB thresholds in
  `detector.py`; segmentation tunables in `panel_segment.py`; the scan `--threshold`
  and `--confirm`.
- Adds detectors / harvest sources, pushes, and you re-run cell 3.

## Reading a result

- **ORB-confirmed lead** = strong: embedding match + geometry (textured panels).
- **embedding-only lead** = still real, especially for low-texture panels
  (blots/microscopy — the Dana-Farber type) where ORB finds few keypoints; review by eye.
- Everything is cross-article by construction (a paper reusing its own panel is skipped)
  and is **probable cause for human review, not a finding**.

## Scale notes
- Start small (`--harvest-n 300`) to validate the loop, then raise it. Harvest is the
  slow, serial part; the GPU embed + FAISS search are fast.
- For a true "millions" corpus, replace the per-article Europe PMC harvest with the
  bulk PMC Open Access package (parallel download) — see `DATA-COLLECTION.md`.
- Persisted index (`corpus_index.npz/.json`) can be committed or stored in Drive so a
  new Colab session resumes without re-embedding.

## Guardrails (do not let any LLM strip these)
Same invariants as `EXECUTION-MAP.md`: signals not verdicts; identity/country-neutral;
corroborate before escalating; human + counsel before contacting anyone or filing.
A PAT with `contents:write` is enough — never grant more, and rotate it after the run.
