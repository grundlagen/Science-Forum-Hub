# Relator-output review — non-GRIM detectors

Review of the lead JSON emitted to `gdrive:sfh/` (Run 02, 2026-07-04). GRIM was already
patched. This is what the *other* detectors are producing and what each needs before any
row is attorney-grade. Every finding below is cited to a real row in the pushed output.

Recurring theme, same as Run 01: **recall is fine, precision is near-zero.** Each detector
fires on a structural artifact of the corpus (linked NIH awards, journal editor-summary
abstracts, hyperauthorship, name collisions, normal co-funding) rather than on misconduct.
None of these outputs can go in a filing as-is.

---

## 1. Grant-vs-grant reuse — `grant_shortlist_R.jsonl` / `grant_shortlist_KvR.jsonl`

This is the "real FCA axis" (grant proposal reuse by same PI). Current top hits are **not**
reuse — they are NIH's linked multi-site mechanism.

- **218 rows, 187 at jaccard 1.0.** Top row: `R01AA020388` "1/2 Multi-site Study: Varenicline
  Treatment of Alcohol Dependent Smokers" (Yale, O'Malley) vs `R01AA020389` "2/2-Multisite
  Study: Varenicline for Alcohol Dependent Smokers" (Columbia, Zweben). The `1/2` and `2/2`
  title prefixes and consecutive core numbers (…388/…389, …163/…164) are NIH **companion
  awards**: one study, split across sites, given an identical abstract by design. Cross-org +
  cross-PI + identical text is the *signature of a legitimate linked award*, not fraud.
- **`same_pi`/`same_org` are being read backwards as risk signals.** For linked awards, "different
  PI, different org, same abstract" is expected. The detector treats that as its strongest lead.
- **Output is heavily duplicated.** The same pair (…388/…389) appears repeatedly with permuted
  PI lists because RePORTER returns one row per project-year/per-PI. 218 rows collapse to far
  fewer unique pairs. Dedup by unordered `{a_core, b_core}` before ranking.
- **The 1 K-vs-R "lead"** (`grant_shortlist_KvR.jsonl`: Schrauben Penn K23 CKD vs Schwartz
  Cornell R01 hepatic-3D, jaccard 1.0) is jaccard=1.0 on **completely different topics** — a
  MinHash artifact, meaning the compared text is shared administrative boilerplate, not science.

**Fixes:** (a) drop pairs whose core numbers are consecutive/share a program cluster; (b) drop
pairs whose titles differ only by a `N/M` multi-site prefix; (c) require a shared PI or shared
PI-email/ORCID for a reuse lead (the whole premise of the axis); (d) dedup on unordered core pair;
(e) strip NIH abstract boilerplate before MinHash so jaccard=1.0 means real overlapping *aims*.

## 2. Paper-vs-paper text reuse — `text_reuse_verified.json`

Known-dead axis (Run 01), still emitting. All 17 "verified" pairs are corpus artifacts:

- **Journal editor-summary pollution** — "Phase separation and gene control…", "DNA sequence and
  inherited gene silencing…", "Steps in the right direction…", "Mapping the vertebrate
  developmental landscape…". OpenAlex indexes the *Science/Nature themed-issue editor blurb* as the
  abstract of every paper in that issue → jaccard6 = 1.0 across unrelated papers.
- **Plazi placeholders** — "(Uploaded by Plazi for the Bat Literature Project) No abstract
  provided." matched to itself.
- **Legit same-author companion papers** — guanidine riboswitch class II vs IV; glycomics vs
  glycoproteomics update; Sestrin2 companion papers.

**Fix:** either retire this detector or hard-filter (a) abstracts shared by ≥2 works in the same
journal-issue, (b) Plazi/"no abstract provided" strings, (c) same-author companion pairs. Until
then it should not surface as leads.

## 3. Benford — `benford_v2.json`

**Flags 4432 of 4877 authors (91%).** A detector that flags 91% of inputs is a null detector.
The top of the ranked list is entirely hyperauthorship + wrong-number-type:

- **Mega-collaboration co-authors share identical fingerprints.** Dragicevic, Waltenberger, Wulz,
  Janssen, Bergauer, Tytgat (CMS) all show `n_numbers ≈ 2648`, `chi_last ≈ 1657.07`, byte-identical
  `first_dist`/`last_dist`. They co-author the same thousand-author papers, so they inherit the same
  number pool. This is a hyperauthorship + no-entity-resolution artifact, not 6 independent frauds.
- **Discipline mismatch.** Top ranks are HEP/cosmology (Carnero Rosell, Gaztañaga, Gruen, DES/CMS).
  Physics numbers (particle masses, redshifts, GeV energies, detector channels, arXiv IDs, years)
  are physical constants and instrument values — Benford's law is not expected to hold, so a huge
  chi² is the null, not a signal. Last-digit chi is inflated by significant-figure rounding.

**Fixes:** (a) resolve to a person/collapse shared mega-paper number pools; (b) extract only
*reported summary statistics* (means/SDs/counts/percentages from Results), not every integer in the
metadata; (c) exclude or separately-model disciplines where Benford is not expected (HEP,
astro, genomics coordinates); (d) recalibrate the flag threshold — a detector should flag a small
tail, not the bulk; (e) require a minimum count of *eligible* numbers, not raw `n_numbers`.

## 4. Duplicate-claim / multi-funder — `duplicate_claim_v3.json`

**19,279 multi-funder papers → 11,764 "award conflicts."** Multi-funder acknowledgement is normal
science, not double-billing.

- Sample lead: "MEGA X: Molecular Evolutionary Genetics Analysis" acknowledging NSF `ABI 1661218`
  **and** NIH `R01 GM126567`. Co-funding one tool/paper across two agencies is expected and proper.
  Nothing here indicates the same deliverable was billed to two grants as if unique.

**Fix:** multi-funder acknowledgement alone is not a lead. The FCA signal is a *specific-aims /
deliverable* charged to two awards as separately-promised unique work — needs aims-overlap +
budget-period overlap + same-deliverable evidence, not a shared acknowledgement line. Reframe this
as an enrichment feature, not a standalone flag.

## 5. Retraction-cluster PIs — `retraction_pis.json`

Three "flagged authors" — all **name-collision artifacts**, no entity resolution.

- "Ju Li" (3 retractions, 93 papers, 163 awards), "Wei Li" (2/197/364), "Chang An Wang". These are
  among the most common Chinese names; the detector aggregates retractions + awards by **name
  string**, collapsing many distinct real people into one node. "Wei Li"'s two "retractions" are a
  biomed JCI-Insight paper (R01 GM awards) and a Nature CAR-T paper (DOE LBNL contract
  AC02-05CH11231) — different fields, near-certainly different people.
- Award lists mix DOE/NSF contract codes with unrelated numeric IDs — clear multi-person merge.
- Retraction arrays contain literal duplicate entries (same `W2187840526` twice) — dedup bug.

**Fix:** entity-resolve before clustering (ORCID, affiliation, co-author graph, funder overlap);
never aggregate misconduct by name string alone. Dedup retraction records. Until resolved, these
are not repeat-offender PIs.

---

## Priority order

1. **Grant-vs-grant (#1)** — highest value, closest to working. Add linked-award/companion filters +
   same-PI requirement + dedup and it starts producing real candidates.
2. **Benford (#3)** — recalibrate + entity-resolve + restrict number types; currently null (91% flag).
3. **Retraction cluster (#5)** — needs entity resolution to mean anything.
4. **Duplicate-claim (#4)** — reframe as enrichment, not a flag.
5. **Paper-vs-paper (#2)** — retire or hard-filter corpus artifacts.

**Cross-cutting need: entity resolution.** #1, #3, and #5 all fail for the same root reason — no
person/award identity layer. That is the single highest-leverage fix (`resolvePi.ts` / `linkage.ts`).
