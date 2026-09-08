# Master Spec & Idea Ledger — Research-Integrity → FCA Extrapolator

Single source of truth consolidating the strategy, case research, legal analysis, and
architecture. **Not legal advice**; legal items are engineering accommodations for US
counsel to validate.

## 1. Vision
- **Near-term engine (building now):** public research + grant data → ranked, provenance-
  backed, FOCUS-grade integrity/disclosure *signals*, packaged for US FCA counsel + DOJ FOCUS.
- **Mid-term product:** searchable "OpenSecrets meets PubPeer" graph (subject to the public-
  disclosure tension below).
- **Long-term:** beyond universities → private grant recipients, subsidiaries, cross-border
  corporate structures (Phase 3).

## 2. Settled decisions
1. "David, but a team + system": clean credentialed reviewers, each a relator on cases they personally analyse.
2. **Individuals are relators, never the entity** (Precision original-source trap).
3. **Lead with Pipeline B (foreign-funding mismatch)**, images second.
4. Don't rebuild the global image DB; build open-source within-corpus detection, license ImageTwin only if needed.
5. **File-first / disclose-to-government-first; publish nothing by default.**
6. Output = probable cause, not proof.
7. **TypeScript, matching this monorepo** (Node 24 / Express / Postgres+Drizzle / Zod / React).
8. Outsider (Irish, non-field) status is neutral-to-positive.
9. Engage DOJ FOCUS (FOCUS.dataminers@usdoj.gov) with counsel on timing.

## 3. Legal model
Research or grant linkage alone does not establish FCA liability. Identify a specific
false claim or material false statement, evidence of knowledge (including deliberate
ignorance or reckless disregard), and materiality under the applicable theory.
No specific intent to defraud is required; that does not remove the knowledge requirement.
See [evidence review](EVIDENCE-REVIEW-2026-09.md).
Gates: **public-disclosure bar + original source** (two paths; First Circuit "materially adds" =
"significant/essential"; blogs are public disclosure; pure data-scans risk the patent-records
"not original source" holding → human expert analysis is not an automatic original-source exception); **first-to-file** (broad; a
race); **FOCUS** (invites data miners; does not automatically remove statutory bars; policy not law);
**seal discipline**; **GDPR/Irish DPA** (Irish lawyer's lane).

## 4. Vectors (feasibility × precedent)
- **B Foreign-funding** (Cleveland Clinic, Van Andel x2, Stanford) — BUILD FIRST.
- **A Image manipulation** (Dana-Farber) — second; needs expert review.
- **C Grant↔paper linkage + certification chain** — shared, decisive.
- **D Fabricated data** (Duke) — deferred.
- **E Non-performance vs objectives** (Harvard/Nadler) — deferred.
- Effort/cost reporting (Harvard 2020, Columbia 2016) — skip.

## 5. Ground-truth = validation set
Known positives (Dana-Farber, Cleveland Clinic, Van Andel x2, Stanford, Duke, Harvard 2020,
Harvard/Nadler) are the labelled set to measure detector precision/recall — the exact "reliable
correlation to fraud" evidence FOCUS wants. Expand programmatically from ORI case summaries,
Retraction Watch DB (Crossref), DOJ settlement PDFs, CourtListener/RECAP, NSF OIG, BioFors.

## 6. System (see ARCHITECTURE.md — delivered separately)
Evidence engine; signals not verdicts; explainability mandatory; legal-by-design; clean inputs;
human review documents independent contributions; original-source status requires legal assessment; scope before scale. Connectors → staging → resolve (OpenAlex
spine) → canonical graph → detectors → scoring → review queue → case package.

## 7. Build plan
- **M0 (done):** schema + provenance/legal hooks + RePORTER & OpenAlex connectors + org→grants→works slice + seeded ground truth.
- **M1:** Pipeline B detector + CORDIS/UKRI + acknowledgment parsing + scoring + validation harness.
- **M2:** certification chain (ExPORTER link tables).
- **M3:** Pipeline A images (open-source within-corpus; ImageTwin optional).
- **M4:** bulk snapshots, partitioning, review console.

## 8. Open decisions / gaps (mostly for counsel)
Monetisation before first settlement; entity/funding structure (champerty/fee-split); FOCUS
validation metrics; PubPeer policy (de-prioritisation signal only); defamation pre-publication
review; reviewer onboarding + conflict-check registry; NSFC data access (defer); API ToS/rate
limits; secrets handling; ethics framing ("funds back to NIH"); jurisdiction; identity false-positives.

## 9. Do not reintroduce
Sci-Hub / pirated corpus; entity-as-relator; rebuilding the global image-match DB; publish-
everything-publicly; random at-scale scanning; B2B "sell leads to firms" as revenue; Python for M0.

## 10. Standing rules
Publish nothing without counsel; default `disclosure_state = internal`; recruit reviewers only
after structure + GDPR are set; every flag serialises reason + evidence + provenance; validate
every detector against the ground-truth set; keep all work additive.
