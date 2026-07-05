# Code review brief — image-forensics + Route A (as of 2026-07-05)

Review of the existing implementation on `claude/qui-tam-data-routes` (the autonomous-loop
build). Scope: `services/image-forensics/`, `scripts/route_a_*`, `route_a_complete.py`,
and the supporting docs. This is a review of code I did **not** write — findings are for
the human, not edits.

TL;DR: **this is real, mature, and unusually self-honest work** (~10.5k Py LOC, running on
a vast 4090). The single best property is that the code *already diagnoses its own biggest
weakness* — precision collapse at scale — in `scale_honesty.py` and `gap_analysis.py`. That
is the same lesson the relator-JSON review reached independently on the text side. The main
risks are (1) demo output that looks like real findings, and (2) at least one legal-claim
overstatement that needs verifying.

---

## What exists (inventory)

- `services/image-forensics/` (~30 modules): panel segmentation, pHash + ORB/RANSAC
  (rotation/scale/crop/flip-invariant), intra-image copy-move, ELA, splicing-seam detector,
  ResNet50 deep-forgery scorer, DINOv2/CLIP multi-scale embedding + FAISS ANN
  (`build_index_gpu_v2.py`), DFCI benchmark, Sholto-David replication, synthetic stress test,
  long-running `scihub_worker.py` / `targeted_worker.py`.
- `services/text-forensics/` (~27 modules): GRIM, Benford, minhash, HNSW passage scan, etc.
- `services/autonomy/`: self-editing orchestrator (the loop that built this).
- Route A: `route_a_complete.py` + `scripts/route_a_*` — SAM × ransomware entity-resolution,
  FAISS time-join, FOCUS-submission output schema.
- Docs: MASTER-SPEC, COST-AND-MOAT, ENTITY-RESOLUTION-SPEC, ROUTE-A-EXECUTION-SUMMARY, etc.

---

## Strengths (keep these)

1. **Self-honesty is the moat.** `scale_honesty.py` states plainly: 83% F1 on 13 synthetic
   images, but at 100k Sci-Hub scale the pipeline is "DO NOT TRUST — 99.96% false positives,"
   and enumerates each detector's failure mode (pHash template collapse on blots, seam
   overfire on panel borders, ELA firing on all JPEG-compressed figures, SSIM on legit
   replicates). This is exactly the precision-not-recall discipline the leads need.
2. **The fixes are already correctly identified**: panel-segment first → image-type classifier
   → ANN pre-filter → per-journal JPEG baseline → lab/paper scoping → require 2+ corroborating
   detectors. That is the right architecture; it just isn't fully wired as the default path yet.
3. **Grounded against commercial + academic SOTA.** `gap_analysis.py` cross-references
   ImageTwin/Proofig capabilities and names concrete open-source integrations to close the gap
   (Noiseprint, Splicebuster, CAT-Net, ForensicHub). Real, buildable, not hand-wavy.
4. **Algorithmic parity for the single-corpus (David-style) case** is plausibly there; the
   honest remaining gap is the ~150M-image cross-literature index (a data/infra spend, not an
   algorithm gap) — correctly scoped in COST-AND-MOAT.

---

## Risks / things to fix (ranked)

### 1. Demo output masquerades as findings — HIGH
`ROUTE-A-EXECUTION-SUMMARY.md` reports "15 FOCUS-submission-ready candidates … Lockheed
Martin, Raytheon, GDIT matched to BlackCat, LockBit, Alphv … confidence 0.156–0.178." Those
are generated from **random demo embeddings** (`route_a_complete.py` "demo mode"), on 3×3
synthetic entities. They are **not real matches** — and the confidence scores (~0.16) are
essentially noise. Risk: a future cold-start session (or a person) reads this as a real hit
list on named defense primes. **Fix:** stamp every demo artifact with a loud `DEMO_ONLY`
flag in the JSON and the summary; never name real companies in demo output (use `ACME-1`).

### 2. "Dana-Farber … 14 admitted in FCA settlement" — NEEDS VERIFICATION — HIGH
Commit `7780bf3` and `data/dana_farber_test_set.py` assert 34 papers with "14 admitted in
FCA settlement." The public record I can confirm is **retractions/corrections** (6 retracted,
31 corrected, Jan 2024, via Sholto David + ImageTwin) — I could **not** confirm an actual
Dana-Farber *FCA settlement*. If this claim is load-bearing for the "grant-fraud is
prosecutable" thesis, it must be sourced to a real DOJ/settlement document before it appears
in any filing or grant application. Treat as **unverified** until a citation exists. (Image
manipulation in grant-cited papers → FCA is a *plausible theory*; an actual DFCI FCA recovery
is a *specific factual claim* and I have no source for it.)

### 3. Precision-collapse fixes are documented but not the default path — MEDIUM
`scale_honesty.py` is a print-out, not a guardrail. The production/worker scripts
(`scihub_worker.py`, `production_pipeline.py`) should *enforce* the five fixes as a required
pre-filter chain, and refuse to emit a lead that lacks ≥2 corroborating high-confidence
detectors. Otherwise the honest analysis stays advisory while the workers still overfire.

### 4. Same entity-resolution gap as the text side — MEDIUM
Route A's confidence is entity-resolution-bound (name+domain → SAM). This is the *same*
person/org-identity problem flagged across the relator review (Wei Li collisions, companion
awards). `ENTITY-RESOLUTION-SPEC.md` exists; make it the shared spine both sides depend on,
not two parallel resolvers.

### 5. Legal-viability precision — LOW/ongoing
The updated `QUI-TAM-DATA-ROUTES.md` is strong. Two nits: (a) it cites *Integra* as
"v. Chatfield" — the well-known appellate decisions are *v. Baylor Scott & White* (5th Cir.)
and the Providence/9th Cir. line; verify the caption before any external use. (b) The
public-disclosure-bar filter (exclude already-public breaches) is described but should be an
*enforced* step in `route_a_complete.py`, not a manual review note — it's the difference
between a viable relator and a barred one.

---

## Highest-leverage next steps (my recommendation)

1. **Make the "honest fixes" the enforced default** in the image workers: panel-seg →
   type-classify → ANN → 2+-detector corroboration → per-journal JPEG baseline. Ship nothing
   that skips the chain. This converts `scale_honesty.py` from confession to guardrail.
2. **Verify or retract the DFCI FCA-settlement claim** with a real citation. This is the
   factual keystone of the grant-fraud axis.
3. **De-risk demo output**: `DEMO_ONLY` stamping + fictitious names. Protects future sessions
   from treating noise as leads.
4. **Benchmark on real ground truth, not synthetic**: pull the PubPeer-annotated DFCI figures
   (`gap_analysis.py` already lists three real DOIs + threads) and RSIID/BioFors; report
   precision/recall there. 13 synthetic images can't calibrate an operating point.
5. **Unify entity resolution** across text + Route A per `ENTITY-RESOLUTION-SPEC.md`.
6. **Then** consider the cross-literature index spend (COST-AND-MOAT) — only after the
   within-corpus path is precision-guarded, since that's where the David-style wins live.

---

## One-line verdict
The engineering is ahead of where the design docs assumed, and its self-assessment is its
best feature. Don't add detectors — *gate* the ones you have behind the precision fixes the
code already knows it needs, verify the one shaky legal fact, and stop demo output from
looking like leads.
