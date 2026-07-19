# SciVet → Integrity Mode: One-Shot Build & Triage Prompt

*A self-contained brief + paste-ready prompt for turning SciVet from a text-rigor
forum into a figure-duplication **triage** tool that surfaces likely-manipulated
papers for expert human review.*

---

## 0. Why this exists (the "recent encouragement")

Scientific image-forensics went from hobby to financially-incentivised public
work in 2025. The load-bearing facts:

- **Sholto David**, an unemployed molecular biologist in Pontypridd, Wales,
  posted a January 2024 blog flagging copy-pasted western-blot bands, duplicated
  flow-cytometry plots, and stretched/rotated images across Dana-Farber papers
  (1999–2017). ([StatNews profile](https://www.statnews.com/2024/01/27/sholto-david-profile-dana-farber-retractions/))
- That work seeded a **False Claims Act (qui tam)** case. On **16 Dec 2025** the
  DOJ announced Dana-Farber would pay **$15M** to settle allegations it made
  false certifications on six NIH grants tied to 14 papers that "reused,"
  "duplicated," or "rotated, magnified, or stretched" images. David, as relator,
  received **17.5% = $2.625M**. ([DOJ](https://www.justice.gov/opa/pr/dana-farber-cancer-institute-agrees-pay-15m-settle-fraud-allegations-related-scientific), [Science/AAAS](https://www.science.org/content/article/misconduct-sleuth-wins-2-63-million-major-cancer-institute-15-million-settlement))
- This is **not a one-off**. FCA recoveries exceeded **$6.8B in FY2025**, with a
  record **1,297 qui tam suits filed** and 401 new government investigations;
  Northwestern paid $2.3M (Jan 2026) over falsified NIH-funded research; DOJ and
  federal watchdogs have publicly told Congress that **relators surface grant
  fraud that audits cannot**, and legal commentators expect David's payout to
  "encourage similar qui tam actions." ([DOJ FY2025](https://www.justice.gov/opa/pr/false-claims-act-settlements-and-judgments-exceed-68b-fiscal-year-2025), [Gibson Dunn](https://www.gibsondunn.com/false-claims-act-2025-year-end-update/), [WilmerHale](https://www.wilmerhale.com/en/insights/client-alerts/20251223-recent-false-claims-act-settlement-highlights-the-importance-of-vetting-federal-grant-applications), [Constantine Cannon](https://constantinecannon.com/whistleblower/dana-farber-pays-15m-to-settle-false-claims-act-allegations-of-nih-grant-fraud/))

**The mechanism that pays out is: figures in NIH-funded, published papers that
were reused/duplicated/manipulated.** That is a *forensic image* problem — and it
is exactly the surface SciVet does **not** currently touch.

### Non-negotiable ethical frame (read before writing any code)

This tool **flags candidates for expert human review. It never renders a verdict
of "fraud" or "misconduct" about a named person or institution.**

- A pixel match is *evidence to inspect*, not a finding. There are innocent
  reasons figures repeat (loading controls shared across panels by design,
  re-use disclosed in the text, republished figures with permission, stock
  schematics). Western blots in particular are **low-texture and self-similar,
  producing high false-positive rates** — treat every hit as a lead.
  ([ImageTwin](https://imagetwin.ai/posts/next-level-western-blot-duplicate-detection))
- Duplication ≠ intent. "Misconduct" is a determination made by institutions,
  journals, ORI, and courts — not by software.
- Output is framed as **"regions to inspect," with a confidence band and the
  reason**, always paired with the original crops so a human decides.
- Escalation goes through **legitimate channels only**: PubPeer, the journal's
  integrity office, the institution's research-integrity officer, ORI, or
  qualified qui tam counsel. The tool does **not** contact authors, publish
  accusations, or auto-file anything.
- Ingest only **legitimately accessible** content (PMC Open Access subset,
  bioRxiv/medRxiv, other open-access/CC-licensed sources). Respect each source's
  terms and rate limits. No paywall circumvention.

Build the responsible version. It is also the *effective* version: false
accusations are what get sleuths sued and get real leads dismissed.

---

## 1. What already exists in this repo (don't re-derive this)

Monorepo: pnpm workspaces, TypeScript 5.9, Node 24, Express 5, PostgreSQL +
Drizzle, Zod (`zod/v4`), Orval codegen from `lib/api-spec/openapi.yaml`, esbuild.

**SciVet is a citizen-science *paper forum*, not a forensics tool.** Flow today:

- `artifacts/scivet` — React/Vite SPA. Pages: `home`, `feed`, `explore`,
  `submit`, `paper-detail`, `paper-edit`, `me`, `profile`. Clerk-ish auth via
  `src/lib/clerk-compat.tsx`.
- `artifacts/api-server` — Express API. Routes: `papers`, `reviews`, `comments`,
  `feed`, `users`, `health`.
- `lib/db/src/schema/*` — Drizzle tables: `papers`, `aiReports`, `reviews`,
  `comments`, `conversations`, `messages`, `revisions`, `profiles`.
- **`papersTable` is text-only**: `title`, `abstract`, `body`, `fields[]`,
  `references(jsonb)[]`, `stage`, `rigorScore`, `aiConfidence`. **No figures, no
  images, no file uploads anywhere in the schema, API, or UI.**
- `artifacts/api-server/src/lib/ai.ts` — the "vetting brain." Calls OpenAI
  (`AI_MODEL = "gpt-5.4"`) to produce a `RigorReportJson` (logic / methodology /
  citations / falsifiability / novelty, 0–10) plus a 5-persona `AiSurveyJson`
  (Skeptic, Domain Expert, Generalist, Methodologist, Outsider). Has a heuristic
  fallback when the model is down. **It reasons over text only.**
- `artifacts/api-server/src/lib/promotion.ts` — `communityScore` /
  `combinedScore` / `computeStage` drive draft → under_review → promoted →
  published.
- `lib/integrations-openai-ai-server/src/image/client.ts` — exports a shared
  `openai` client (configurable `baseURL`) plus `generateImageBuffer` /
  `editImages` (`gpt-image-1`). **Reuse this client** for vision calls; the
  base URL/key plumbing already works.

**Branches:** only `main` and the working branch
`claude/colab-notebook-output-vgvzbs`. There is no hidden forensics prototype on
another branch — the capability has to be built.

**Bottom line:** the AI scoring, promotion pipeline, review/comment social layer,
and codegen toolchain are reusable. The **entire figure axis is missing** and is
the whole ballgame for the Sholto-David use case.

---

## 2. The forensic methods to implement (grounded, not invented)

Duplication/manipulation falls into a small number of well-characterised classes
(the Bik taxonomy + standard copy-move forensics). Detect these, in order of
tractability:

1. **Exact / near-duplicate whole figures** — same panel reused across papers or
   within a paper for a different condition. Cheapest, highest-precision. Perceptual
   hashing (pHash/dHash) + embedding cosine similarity.
2. **Copy-move within an image** — a region cloned and pasted elsewhere in the
   same figure (duplicated bands, cells, mice). Classic **block-matching / keypoint
   (SIFT/SURF/ORB) copy-move forgery detection**; cluster matched keypoints with
   consistent affine offset. ([SURF+HAC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3842042/), [DCT copy-move](https://arxiv.org/pdf/1308.5661))
3. **Transformed reuse** — the same region rotated / flipped / scaled / stretched
   / contrast-adjusted. Rotation/scale-invariant keypoint matching (ORB/SIFT with
   RANSAC affine fit); flag the recovered transform.
4. **Splicing / seams** — western-blot or gel lanes cut and merged. Look for
   background discontinuities, duplicated backgrounds, and sharp intensity seams.
   ([ImageTwin](https://imagetwin.ai/image-manipulation-detection/), [western-blot detection](https://www.researchgate.net/publication/322937330_Design_and_implementation_of_a_manipulation_detection_system_for_western_blot_images))

Commercial baselines to benchmark *against* (not to copy): **ImageTwin** and
**Proofig** (the latter adopted by the *Science* journals in 2024). Elisabeth
Bik's public catalogue of >4,000 flagged papers is the canonical description of
the failure modes. ([Bik](https://en.wikipedia.org/wiki/Elisabeth_Bik))

**Western-blot caveat, restated because it dominates real-world precision:** low
texture → many false hits. Gate blot matches harder (higher similarity
threshold, require corroborating structure, always show crops).

---

## 3. THE ONE-SHOT PROMPT (paste this to the build agent)

> You are extending **SciVet** (this repo — read §1 above; do not re-derive it)
> with an **Integrity Mode** that ingests scientific *figures* and surfaces
> likely image **duplication/manipulation candidates for human review**. Read the
> ethical frame in §0 and honour it in code, copy, and API design: the system
> flags *regions to inspect* with confidence bands and reasons, never declares
> fraud, always shows the original crops, and routes escalation only to
> legitimate channels. Ingest only legitimately accessible sources (PMC OA
> subset, bioRxiv/medRxiv, open-access/CC). Keep a human in the loop before any
> external action.
>
> Work in the existing monorepo conventions (pnpm workspaces, Drizzle, Zod v4,
> Orval codegen from `lib/api-spec/openapi.yaml`, Express 5). Reuse the shared
> `openai` client from `@workspace/integrations-openai-ai-server` for any vision
> call. Keep `pnpm run typecheck` green at every step and commit in small,
> described increments.
>
> **Build in this order, and stop at each checkpoint to run the quick test in §4
> before moving on:**
>
> **A. Data model (`lib/db/src/schema`).** Add:
> - `figuresTable` — `id`, `paperId?` (nullable: figures can come from external
>   corpora, not just SciVet submissions), `sourceType` ('submission' | 'pmc' |
>   'biorxiv' | 'upload'), `sourceRef` (DOI/PMCID/URL), `panelLabel`, `caption`,
>   `storageKey`, `width`, `height`, `phash` (text), `embedding` (jsonb or
>   pgvector if available), `createdAt`.
> - `figureMatchesTable` — `id`, `figureAId`, `figureBId`, `matchClass`
>   ('near_dup' | 'copy_move' | 'transformed' | 'splice'), `similarity` (0..1),
>   `transform` (jsonb: recovered affine/flip/scale, nullable), `regions` (jsonb:
>   bounding boxes on each figure), `status` ('unreviewed' | 'confirmed' |
>   'dismissed' | 'benign_explained'), `reviewerId?`, `reviewerNote?`,
>   `createdAt`. Enforce a canonical A<B ordering + unique index to dedupe pairs.
> - Extend `aiReports`/paper summary with an optional `integrityFlagCount` so the
>   forum surfaces "has open integrity flags" without leaking accusations.
> - Run `pnpm --filter @workspace/db run push` conventions; regenerate zod/hooks
>   via Orval after touching `openapi.yaml`.
>
> **B. Ingestion (`artifacts/api-server/src/lib/ingest/`).** A pluggable fetcher
> interface `FigureSource` with adapters:
> - `pmcOa` — resolve a PMCID/DOI to the PMC Open Access package, pull figure
>   images + captions.
> - `biorxiv` — resolve a DOI to the preprint PDF, extract embedded raster
>   figures.
> - `upload` — multipart upload for a user-supplied PDF/image (add
>   `multer`-style handling; the repo has none yet).
> Each adapter returns normalised `{ bytes, caption, panelLabel, sourceRef }`.
> Store bytes to a `storageKey` (local disk dir behind an env-configurable path
> to start; leave a seam for S3). Respect per-source rate limits and record
> provenance on every figure. **No paywalled fetching.**
>
> **C. Figure preprocessing + panel splitting.** Given a figure image, split
> multi-panel figures into panels (contour/whitespace segmentation), normalise
> (grayscale, resize, contrast-normalise for hashing). Persist panels as their
> own `figures` rows linked to the parent.
>
> **D. Detection pipeline (`artifacts/api-server/src/lib/forensics/`).** Implement
> the four detectors from §2 as separate, individually-testable functions:
> 1. `nearDuplicate(a,b)` — pHash Hamming distance + embedding cosine. Fast
>    prefilter across the whole corpus (bucket by pHash prefix / ANN over
>    embeddings) so you compare O(candidates), not O(n²).
> 2. `copyMove(img)` — keypoint (ORB/SIFT) self-match within one image; cluster
>    by consistent offset; return cloned region boxes.
> 3. `transformedReuse(a,b)` — cross-image keypoint match + RANSAC affine; report
>    the recovered rotation/scale/flip.
> 4. `spliceSeams(img)` — background-discontinuity / duplicated-background /
>    intensity-seam heuristics tuned for blots and gels.
> A `scoreMatch()` combiner turns detector outputs into `{matchClass, similarity,
>    regions, transform}`. **Gate western-blot/gel matches with a higher
>    threshold** (detect blot-likeness from caption keywords + low-texture score)
>    and never emit a blot hit without crop coordinates. Prefer classical CV
>    (sharp/jimp/opencv bindings or a small Python sidecar) for reproducibility;
>    use the vision model only to *describe/triage* a flagged pair, never as the
>    sole detector.
>
> **E. Suspicion ranking (`forensics/rank.ts`).** Aggregate per-paper: a
> `suspicionScore` from count + class + confidence of matches, penalising the
> western-blot FP tendency and boosting cross-paper reuse and transformed reuse
> (rotation/scale/flip of the "same" region is the strongest single signal). This
> is what "zeroing in on likely candidates" consumes.
>
> **F. API (`artifacts/api-server/src/routes/integrity.ts`, add to
> `openapi.yaml`).**
> - `POST /integrity/scan` — body: a corpus selector (list of DOIs/PMCIDs, an
>   author, a journal+date range, or an uploaded file). Enqueues ingestion +
>   detection; returns a `scanId`.
> - `GET /integrity/scans/:id` — progress + ranked candidate papers.
> - `GET /integrity/papers/:ref/matches` — the match list with crops + reasons +
>   recovered transforms.
> - `POST /integrity/matches/:id/review` — human sets status
>   (confirmed/dismissed/benign_explained) + note. **Only humans change status.**
> Reuse `requireAuth`. Rate-limit scans.
>
> **G. UI (`artifacts/scivet/src/pages/integrity/`).** A triage console:
> - **Candidate queue** sorted by `suspicionScore` — the "likely candidates"
>   list. Show source, journal, class mix, top match thumbnail.
> - **Pair inspector** — the two crops side by side, matched regions boxed, the
>   recovered transform annotated, similarity + class, caption text. Buttons:
>   Confirm / Dismiss / "Benign — explain". Every screen carries a standing
>   disclaimer: *"Candidate for human review. Not a determination of misconduct."*
> - **Escalation panel** — a checklist that assembles a PubPeer-style neutral,
>   factual write-up (figure refs, observation, no intent language) and links to
>   PubPeer / journal integrity contact / ORI / counsel. It **drafts for the
>   human; it does not send.**
>
> **H. Guardrails in code.** Central `INTEGRITY_DISCLAIMER` constant rendered on
> every candidate view and included in every API payload. No endpoint, template,
> or model prompt may emit the words "fraud"/"fabrication"/"misconduct" as a
> conclusion about a named party; the model's triage prompt must be instructed to
> describe *observations* ("panels 2c and 4a share an identical 118×64 region
> under a 90° rotation") and enumerate innocent explanations.
>
> **Deliverables:** typechecking code, migrations, seeded demo corpus (see §4),
> unit tests for each detector against known-duplicate and known-distinct
> fixtures, and a short `README` in `artifacts/scivet/docs/` documenting how to
> run a scan and interpret results. Commit incrementally; push to the working
> branch.

---

## 4. Operational triage — "run quick tests on likely candidates, zeroing in"

This is the part that isn't code: how to *use* the tool to actually find
something, cheaply, without drowning in false positives. Bake these as scripted
"quick tests" (`artifacts/api-server/scripts/`), runnable before the full build
is done so each detector earns its place.

**Quick test ladder (cheap → expensive):**

1. **Fixture sanity (seconds).** A tiny fixture set: 3 known-duplicate pairs
   (one exact, one rotated, one spliced) + 3 known-distinct pairs. Every detector
   must catch all positives and clear all negatives before it ships. This is the
   unit-test gate for §3D.
2. **Self-consistency scan (minutes).** Point the tool at a **single paper's own
   figures** (intra-paper reuse — the most defensible, self-contained signal, and
   how David started). No cross-corpus fetching needed. Rank panels by
   copy-move/near-dup within the paper.
3. **Small labelled corpus (tens of minutes).** Pull ~50–100 open-access papers
   that include **already-retracted / already-PubPeer-flagged** papers as known
   positives (Retraction Watch / PubPeer give you ground truth). Measure
   precision@10 and recall on the known positives. This calibrates thresholds and
   the western-blot gate.
4. **Cold corpus, zeroed-in (hours).** Only after 1–3 look good, run a *narrow*
   cold slice — one lab / one journal-section / one date window of PMC OA — and
   review the **top-ranked candidates only**. Narrow beats broad: a focused,
   well-understood corpus produces reviewable leads; a web-scale sweep produces
   noise you can't triage.

**Zeroing-in heuristics (what makes a lead worth a human's time):**
- **Cross-paper reuse of the "same" panel under a transform** (rotate/flip/scale)
  is the single strongest signal — near-impossible to explain innocently.
- **Reuse across *different* stated experimental conditions** (caption A says
  "control," caption B says "treated") — read the captions, not just the pixels.
- **Clustering:** several independent matches within one author/lab raises the
  prior. One isolated blot similarity does not.
- **Down-weight** shared loading controls, explicitly disclosed reuse, and
  low-texture blot-only matches with no corroboration.

**Human verification protocol (mandatory before any escalation):**
1. Open both figures at full resolution; confirm the match is real, not a
   thumbnail artifact.
2. Read both captions and the methods; rule out disclosed/legitimate reuse.
3. Write a **neutral, factual** observation (regions, transform, figure numbers)
   — the PubPeer register: *what you see*, never *what they intended*.
4. Route: PubPeer for public technical comment → journal integrity office → ORI /
   institutional RIO → qualified qui tam counsel **only** if it's NIH/federally
   funded and a lawyer advises there's a case. The tool assists the write-up; the
   human and counsel decide.

**Metrics to watch:** precision@k on the candidate queue (optimise this — a
reviewer's attention is the scarce resource), recall on the labelled-positive
set, and false-positive rate on blots specifically. Ship threshold changes only
when precision@10 holds on the labelled corpus.

---

## 5. Acceptance criteria

- [ ] `pnpm run typecheck` green; new packages build.
- [ ] Schema, ingestion adapters (≥ PMC OA + upload), all four detectors,
      ranking, API, and triage UI implemented per §3.
- [ ] Every detector passes the §4 fixture gate; labelled-corpus precision@10 and
      recall reported in the docs README.
- [ ] `INTEGRITY_DISCLAIMER` present on every candidate view and API payload; no
      code path emits a misconduct *conclusion* about a named party.
- [ ] Escalation panel drafts but never sends; only legitimate channels linked.
- [ ] Ingestion restricted to legitimately accessible sources with recorded
      provenance and respected rate limits.
- [ ] Scripts in §4 runnable standalone for the quick-test ladder.

---

### Sources
- DOJ — Dana-Farber $15M settlement: https://www.justice.gov/opa/pr/dana-farber-cancer-institute-agrees-pay-15m-settle-fraud-allegations-related-scientific
- Science/AAAS — David's $2.63M relator award: https://www.science.org/content/article/misconduct-sleuth-wins-2-63-million-major-cancer-institute-15-million-settlement
- StatNews — David profile: https://www.statnews.com/2024/01/27/sholto-david-profile-dana-farber-retractions/
- DOJ — FCA recoveries exceed $6.8B FY2025: https://www.justice.gov/opa/pr/false-claims-act-settlements-and-judgments-exceed-68b-fiscal-year-2025
- Gibson Dunn — FCA 2025 Year-End Update: https://www.gibsondunn.com/false-claims-act-2025-year-end-update/
- WilmerHale — vetting federal grant applications: https://www.wilmerhale.com/en/insights/client-alerts/20251223-recent-false-claims-act-settlement-highlights-the-importance-of-vetting-federal-grant-applications
- Constantine Cannon — Dana-Farber FCA analysis: https://constantinecannon.com/whistleblower/dana-farber-pays-15m-to-settle-false-claims-act-allegations-of-nih-grant-fraud/
- ImageTwin — western-blot duplicate detection / FP rates: https://imagetwin.ai/posts/next-level-western-blot-duplicate-detection
- ImageTwin — manipulation detection overview: https://imagetwin.ai/image-manipulation-detection/
- Western-blot manipulation detection system: https://www.researchgate.net/publication/322937330_Design_and_implementation_of_a_manipulation_detection_system_for_western_blot_images
- Copy-move forgery (SURF+HAC): https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3842042/
- Copy-move forgery (DCT): https://arxiv.org/pdf/1308.5661
- Elisabeth Bik: https://en.wikipedia.org/wiki/Elisabeth_Bik
