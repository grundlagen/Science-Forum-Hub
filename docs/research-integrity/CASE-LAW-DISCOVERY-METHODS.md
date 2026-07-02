# Case law: how the frauds were actually DISCOVERED — and what that means for our detectors

*Reference/design note. Not legal advice. Every entry maps a real case's discovery
method to a detector in this repo, because "how it was found" is the spec for what to
build. Sources listed at the end.*

## 1. Are building/construction contractors in scope? YES.

Construction on federally funded projects sits squarely under the False Claims Act.
Every claim for payment on a federal or federally-funded (highway, bridge, military,
transit) project carries express or implied certifications — of test results, of
Disadvantaged Business Enterprise (DBE) participation, of Davis-Bacon prevailing
wages, of Buy America content, of spec compliance. Falsity in any of them is an FCA
case, and the case law is deep:

| Case | What happened | Recovery |
|---|---|---|
| Ohio asphalt (Kokosing/Shelly, 2025) | Fabricated/copied asphalt QC test data on federally funded highway work | ~$30M combined |
| Boston "Big Dig" (Bechtel/Parsons + subs) | Defective slurry walls, failed epoxy bolts, concealed defects | $407M + $51M |
| Detroit Metro Airport (2007) | DBE fraud on federally funded construction | $11.75M |
| Whittier Bridge / I-95 (Walsh + Melo's) | DBE pass-through scheme | ~$1.25M |
| Platt Memorial Bridge (Sherwin-Williams) | Supplier's role in a DBE front scheme | $1M |
| Mountain States Contractors (TN) | DBE false claims on highway work | $2.25M+ |
| Circle C Construction | False Davis-Bacon certified payrolls (electricians underpaid ~$9,900) | ~$750K judgment |
| Texas concrete manufacturer (PPP) | Whistleblower PPP-eligibility allegations | $1.8M |

State FCAs (California etc.) add state-funded construction: e.g. a project-manager
relator who compared six months of cost-plus billing against timesheets — $18M
recovery, 18% relator share ($3.24M).

## 2. Discovery methods, case by case → detector mapping

### 2.1 Copied test data (Ohio asphalt, 2025 — the single best template for us)
**How discovered:** relators reviewed asphalt QC submissions and noticed data points
copied from *other* tests rather than measured — and copied from multiple sources to
lower detection odds. Hundreds of manipulated submissions. Motive: less asphalt
cement = big cost savings.
**Our detector:** `detectors/copiedTestData.ts` — exact duplicate measurement
vectors + shared runs of >=5 consecutive identical values across submissions,
extra weight for cross-project reuse. This is the image-duplication idea applied to
numbers, which is exactly what the relators did by eye.

### 2.2 DBE fronts / pass-throughs (Platt Bridge, Whittier/I-95, Detroit Metro)
**How discovered:** insiders + DOT-OIG audits showing the certified DBE did no
commercially useful function — the non-eligible firm did the work and the DBE was a
paper conduit, often sharing people/premises with the prime.
**Our detector:** `detectors/passThroughFront.ts` — shared address/officers,
>=70% pass-through of prime award value, captive exclusivity across awards. Needs
>=2 independent indicators to fire (corroboration doctrine).

### 2.3 Davis-Bacon certified payroll (Circle C)
**How discovered:** DOL Wage-and-Hour review found the weekly certified payrolls
false; the FCA hook is the *knowing* false certification, not the wage error itself.
**Our coverage:** the certification-chain builder (`certification.ts`) models
payroll certification as an implied false certification; payroll data itself is not
public, so this stays a case-package element rather than a public-data detector.

### 2.4 Bid rigging (DOJ Antitrust program; OECD screens)
**How discovered (literature + agency practice):** statistical screens over bid
distributions — abnormally low coefficient of variation, cover-bid gaps (relative
distance between the two lowest bids vs the losing-bid spread), and rotation of
winners inside a stable bidder group. ML studies on Brazilian/Italian/Japanese/
Swiss/US cartel data classify 84–90% of collusive tenders with these features.
**Our detector:** `detectors/bidRigging.ts` — CV screen, RD screen (>=4 bids),
rotation screen; fires only on >=2 concordant screens. Feeds the DOJ Antitrust
Whistleblower program mapping and the FCA where the rigged contract is federal.
OCDS connector supplies bid-level data for 50+ countries; US bid-level data comes
from state DOT letting results.

### 2.5 PPP data mining (the FOCUS-era mainstream)
**How discovered:** since FY2024, >45% of all qui tam complaints are filed by data
miners; PPP is the most active area. Method: cross-reference the public SBA FOIA
loan file against registries, company statements, and arithmetic caps.
**Our detector:** `integrations/sba-ppp` (public CSV parser/index) +
`detectors/pppAnomaly.ts` — per-job amounts above the $20,833 first-draw ceiling
(with 50% margin), >2 draws at one name+address, forgiveness above approval.
DOJ's own caveat built in: summary data screens, it does not plead falsity — every
hit needs document-level corroboration before anything is filed.

### 2.6 Fabricated statistics (Sholto David / Dana-Farber; "data thugs")
**How discovered:** outside reviewers ran arithmetic checks on published numbers —
GRIM (a reported mean must be reachable from N integers), SPRITE, Carlisle's
baseline-randomness method — plus image-duplication review.
**Our detector:** `stats/fabrication.ts` — GRIM, Benford first-digit (>=100
values), terminal-digit uniformity (>=50 values). Works on paper stats AND on
billing/QC ledgers, so the same screen serves research grants and procurement.

### 2.7 Image duplication (Dana-Farber template)
**How discovered:** panel-level visual comparison across a lab's own papers.
**Our stack:** `services/image-forensics/` — pHash + ORB/RANSAC + flip-invariant
pass + intra-image copy-move (100% recall, 0 FP on the synthetic benchmark), and now:
- `panel_segment.py` — projection-profile panel splitting (compare panels, not figures);
- `embedding_index.py` — the ImageTwin architecture: embed every panel
  (DINOv2 when torch is present, flip-canonicalized classical descriptor otherwise)
  into a persistent cosine index; query any new panel against the whole corpus;
  confirm shortlist hits with ORB/RANSAC. `index_test.py`: 11/11 (recompressed,
  rescaled, mirrored, brightness-shifted panels all retrieve their source; clean
  panels stay below the lead threshold).
ImageTwin's remaining edge is purely its ~150M-figure corpus — a harvesting job
(open-access PDFs -> figures -> panels -> index), not an algorithm we lack.

## 3. The pattern across all of it

1. **Fraud leaves arithmetic residue in public or obtainable data** — copied numbers,
   impossible means, over-tight bids, over-cap loans, duplicated pixels.
2. **Single signals are weak; concordance convicts** — every detector here either
   requires >=2 independent indicators to fire or is capped until `corroborate.ts`
   sees a second detector agree. That matches DOJ FOCUS's stated preference for
   pre-filing rigor and its warning that data-mined cases fail on falsity/materiality
   when they rest on summary statistics alone.
3. **The relator who wins is the one who did the document work** — the asphalt
   relators didn't file "statistics"; they filed hundreds of identified, copied
   submissions. Our case packages must always descend from signal to named documents.

## Sources

- PilieroMazza, [$30M asphalt settlement analysis](https://www.pilieromazza.com/a-kick-in-the-asphalt-30-million-settlement-highlights-fca-risk-for-construction-contractors/)
- Phillips & Cohen, [Fraud in construction projects](https://www.phillipsandcohen.com/fraud-construction-projects/)
- DOJ, [False Claims Act overview](https://www.justice.gov/civil/false-claims-act) and [FY2025 FCA statistics ($6.8B)](https://www.justice.gov/opa/pr/false-claims-act-settlements-and-judgments-exceed-68b-fiscal-year-2025)
- DOJ, [FOCUS initiative announcement](https://www.justice.gov/opa/pr/civil-division-announces-focus-initiative-data-miners-filing-qui-tam-complaints); commentary: [Arnold & Porter](https://www.arnoldporter.com/en/perspectives/blogs/fca-qui-notes/posts/2026/05/dojs-new-focus-on-data-mined-fca-filings), [WilmerHale](https://www.wilmerhale.com/en/insights/client-alerts/20260505-doj-announces-initiative-for-data-miners-filing-qui-tam-complaints), [Dorsey](https://www.dorsey.com/newsresources/publications/client-alerts/2026/5/doj-launches-focus-initiative), [Akin](https://www.akingump.com/en/insights/alerts/doj-civil-division-launches-focus-initiative-to-enhance-partnerships-with-data-miner-whistleblowers), [Wiley](https://www.wiley.law/alert-DOJs-FOCUS-on-Data-Mining-Whistleblowers)
- DOJ (2007), [$11.75M Detroit Metro DBE settlement](https://www.justice.gov/archive/opa/pr/2007/March/07_civ_153.html); DOT-OIG DBE cases: [Mountain States](https://www.oig.dot.gov/library-item/33271), [$1.2M DBE settlement](https://www.oig.dot.gov/library-item/39446); TZ Legal, [Platt Bridge DBE case](https://www.fraudfighters.net/news/bridge-too-far-dbe-fraud/); SMGG, [steel DBE settlement](https://www.smgglaw.com/news/steel-construction-companies-to-pay-440000-00-to-settle-dbe-fraud-allegations/)
- DOL, [Davis-Bacon investigative procedures](https://www.dol.gov/agencies/whd/government-contracts/prevailing-wage-resource-book/dbra-investigative-procedures-remedies); Taft, [Davis-Bacon FCA analysis](https://www.taftlaw.com/news-events/law-bulletins/do-davis-bacon-violations-create-false-claims/); [Circle C summary](https://tsheets.com/davis-bacon-act-tips)
- Whistleblower Network News, [$1.8M PPP concrete-manufacturer settlement](https://whistleblowersblog.org/false-claims-qui-tam-news/whistleblowers-ppp-fraud-allegations-result-in-1-8-million-settlement-with-texas-concrete-manufacturer/)
- Bid-rigging screens: [Huber & Imhof, ML with screens](https://www.sciencedirect.com/science/article/abs/pii/S0167718719300219); [multi-country validation](https://www.sciencedirect.com/science/article/abs/pii/S0144818821000405); [OECD data-screening paper](https://one.oecd.org/document/DAF/COMP/WP3(2022)5/en/pdf); [Porter & Zona, JPE](https://www.journals.uchicago.edu/doi/abs/10.1086/261885)
- Fabrication statistics: [GRIM (Brown & Heathers)](https://www.researchgate.net/publication/309275131_The_GRIM_Test_A_Simple_Technique_Detects_Numerous_Anomalies_in_the_Reporting_of_Results_in_Psychology); [SPRITE](https://peerj.com/preprints/26968.pdf); [Carlisle-method analysis](https://www.biorxiv.org/content/10.1101/179135.full.pdf); Science, ["data thugs"](https://www.science.org/content/article/meet-data-thugs-out-expose-shoddy-and-questionable-research)
