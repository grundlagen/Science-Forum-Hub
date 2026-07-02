# Peer-review engines (forum) + data-miner tradecraft (relator) — adopted, not reinvented

*How we wrap the established open-source screening tools into the forum's peer-review
layer, and how we encode the professional data-miner qui tam playbook. Not legal
advice.*

## Part 1 — AI peer-review for the Forum Hub (the "multiple wheels")

The mature ecosystem here is the QUEST/ASWG **ScreenIT** pipeline, which runs a bundle
of open tools over every bioRxiv/medRxiv preprint and emits one integrated report. We
copy that design exactly: a checker registry, native checkers we implement, and
adapters to the external engines.

Code: `lib/extrapolator/src/peerReview/` — `runPeerReview(manuscript, allCheckers(cfg))`
returns a `PeerReviewReport` (major/minor flags + a triage recommendation). Everything
is a lead for human review, never a verdict.

### Native checkers (implemented + tested, no external dependency)

| id | what it does | based on |
|---|---|---|
| `statcheck` | recompute the p-value from the reported test statistic + df; flag inconsistencies and "decision" (gross) inconsistencies where significance flips | Nuijten et al. *statcheck* (reimplemented in TS on `stats/mathdist.ts` — our own t/F/χ²/z/r CDFs) |
| `fabrication-stats` | GRIM / Benford / terminal-digit impossibilities | `stats/fabrication.ts` |
| `reference-sanity` | duplicate DOIs, malformed DOIs, references with neither DOI nor title | native (offline) |

`verify-statcheck` (15/15) checks the distribution math against textbook critical
values (t(20)=2.086→p≈.05, χ²(1)=3.841, F(1,20)=4.351, z=1.96, r) and the
consistent / general / decision-inconsistency classification.

### External-engine adapters (the seams — wire when you have access)

`peerReview/externalCheckers.ts`. Each is unavailable until configured, so the
pipeline runs offline and skips them; give it an endpoint/CLI and it lights up. No
adapter fabricates a result when unconfigured (proven by `verify-peer-review`).

| adapter | engine | checks |
|---|---|---|
| `sciscore` | **SciScore** | MDAR/ARRIVE/CONSORT rigor, blinding/randomization/sample-size, RRIDs |
| `oddpub` | **ODDPub** (quest-bih) | open-data / open-code detection |
| `rtransparent` | **rtransparent** | funding, COI, registration transparency |
| `barzooka` | **Barzooka** (quest-bih) | bar graphs of continuous data |
| `jetfighter` | **JetFighter** | rainbow colour maps (misleading / not colourblind-safe) |
| `seek-blastn` | **seek & blastn** | wrong / misidentified nucleotide-sequence reagents |
| `refchecker` | **RefChecker** | citation existence via Crossref / OpenAlex / Semantic Scholar |
| `imagetwin` / `proofig` | **ImageTwin / Proofig** | cross-literature figure duplication |
| `image-forensics` | our in-repo Python service | pHash / ORB / flips / copy-move / panel index |

To integrate one: fill the single marked WIRING POINT in `makeAdapter` (call the
engine, translate its output to `CheckFlag[]`), and pass its endpoint/cmd in the
`ExternalConfig`.

## Part 2 — Data-miner tradecraft, encoded (the relator "wheels")

Since FY2024 data miners file >45% of qui tam complaints, but they have a *lower*
success rate — summary-data signals often can't plead falsity/materiality with
particularity. The professional relators (and DOJ's FOCUS initiative) converge on four
requirements. We encode them as a **pre-filing readiness gate** so a candidate is
scored before anyone files or contacts a target.

Code: `lib/extrapolator/src/focusGate.ts` — `assessFocusReadiness(profile)` →
`FocusAssessment` (per-requirement score + gaps + readiness). `verify-focus-gate` 8/8.

| # | FOCUS requirement | what the gate wants |
|---|---|---|
| 1 | high-quality, **predictive** signal | ≥2 corroborating detectors + a measured precision/recall (run the validation harness) |
| 2 | **Rule 9(b) particularity** | named defendant(s), specific claims/awards, dates, and **confirmed identity** (no common-name conflation) |
| 3 | **innocent explanations rebutted** | the benign readings written down AND checked off (the temp-staffing / shared-address defenses) |
| 4 | **program-rule mastery** | the specific statute + the program eligibility rule it violates, cited |

Readiness: `not_ready` → `developing` → `meeting_worth_counsel`. The gate never says
"file" — counsel owns seal, first-to-file, and the original-source analysis
(31 U.S.C. §3730(e)(4)).

### The tricks worth internalizing (from the pro data-miner world)
- **Cross-reference, don't single-source.** PPP winners cross-referenced against state
  registries, company sites, and address clustering (ProPublica's method) — mirrored by
  our corroboration layer + PPP address index.
- **Anticipate the defense first.** The strongest filings pre-rebut the innocent story;
  requirement 3 forces this.
- **Map data → legal element.** An outlier is not a claim; requirement 4 forces the
  eligibility-rule citation that turns a signal into an allegation.
- **Confirm identity before naming anyone.** The live-run "Qing Wang" false positive is
  why requirement 2 includes an identity gate.

## How the two parts connect
The forum's peer-review screen produces public, transparent integrity flags
(legitimacy). When a flag is corroborated and maps to public money, it becomes a relator
signal; the FOCUS gate then decides whether it's fileable. Same engine, two audiences —
journals/authors on one side, DOJ/counsel on the other.

## Sources
- ScreenIT / ASWG: [Sciety group](https://sciety.org/groups/screenit/about); [aswg-pipeline](https://github.com/PeterEckmann1/aswg-pipeline); [BIH QUEST automated screening tools](https://www.bihealth.org/en/quest/service/service/automated-screening-tools)
- statcheck: [Nuijten & Polanin, *Res. Syn. Methods* 2020](https://onlinelibrary.wiley.com/doi/full/10.1002/jrsm.1408); [MicheleNuijten/statcheck](https://github.com/MicheleNuijten/statcheck); [Python port](https://github.com/hplisiecki/statcheck_python)
- Tools: [SciScore](https://sciscore.com/); [ODDPub](https://github.com/quest-bih/oddpub); [Barzooka](https://github.com/quest-bih/barzooka); seek & blastn; [RefChecker]; ImageTwin / Proofig
- FOCUS: [DOJ announcement](https://www.justice.gov/opa/pr/civil-division-announces-focus-initiative-data-miners-filing-qui-tam-complaints); [Foley on AI data mining + PPP FCA](https://www.foley.com/insights/publications/2026/01/ai-data-mining-and-ppp-false-claims-act-cases/); [Epstein Becker Green](https://www.healthlawadvisor.com/doj-focus-initiative-prioritizes-high-quality-data-miner-actions-by-fca-whistleblowers)
