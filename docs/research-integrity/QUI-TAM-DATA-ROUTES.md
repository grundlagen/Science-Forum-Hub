# Qui Tam Data Routes: Ranking by Falsifiability, Compute, and Legal Viability

## Executive Summary

The False Claims Act requires more than finding an outlier. *Integra Med Analytics v. Chatfield* established the rule: a qui tam relator must find a public dataset that contradicts a specific written certification, where the gap cannot be explained by innocent variation ("some providers are just better"). This constraint kills half the obvious ideas and tells you exactly where to point compute.

Four routes ranked by whether your hardware matters, whether the legal barriers are navigable, and which can actually survive a motion to dismiss.

---

## Route A: Cyber Self-Attestation × Ransomware Breach Corpus (Flagship)

**Legal viability: HIGH | Compute intensity: HIGH | Your hardware advantage: CRITICAL**

### The Certification
- **Who:** ~600k DoD contractors registered in SAM.gov
- **What:** NIST SP 800-171 / DFARS 252.204-7012 compliance self-attestation
- **When:** Bulk-downloadable via GSA Entity Extracts API (with effective dates)
- **Why it's falsifiable:** Written representation to the government — the exact thing FCA attaches to

### The Contradiction
- **Source:** Ransomware leak-site metadata (victim names + dates, NOT the stolen data itself)
  - RansomLook: 16,000+ attacks, 2,000+ documented leaks
  - Academic dataset: 27,000 breach-forum posts, 325+ ransomware groups
  - ransomwatch.com, RansomLook, group homepages
- **Scale:** ~30k unique victim entities; join against 600k SAM entities
- **Why it works:** A contractor that self-certified NIST controls (encryption, access control, incident response) and shows up as a ransomware victim *during the same contract period* isn't a statistical outlier—it's prima facie evidence the certified controls weren't implemented. A breach is a specific contradiction of a specific control.

### What Makes This Route Survive *Integra*
1. **Specific certification + specific breach** — not "bad at everything," but provable gap in a documented control
2. **Time-joined contract period** — narrows causation, rules out "happened after they left"
3. **Not explainable by luck** — possession of encrypted data requires the control be absent
4. **Verifiable independently** — breach disclosure timelines, SAM attestation dates, contract databases

### Government Track Record
- MORSECORP, Georgia Tech, Penn State, Raytheon ($8.4M) — all NIST-attestation FCA cases
- $52M across 9 FY2025 settlements (FOCUS initiative focus)
- Every reviewed case: whistleblower-driven, mostly insiders
- **Pattern:** Nobody is systematically mining the breach corpus against the attestation registry. That's the open lane.

### Compute Reality
- **Bottleneck:** Entity resolution across ~600k SAM entities × ~30k leak victims
- **Method:** SPECTER2 embeddings (entity-name + domain string) → FAISS/HNSW nearest-neighbor
- **Your existing stack:** SPECTER2 + HNSW from Science-Forum-Hub ports almost directly (swap abstracts for entity strings)
- **Cost:** GPU ingestion + embedding is a few GPU-hours. Well under £100.
- **Data ingest:** Scrape/ingest leak-site metadata (public victims lists, dates, domains). Do NOT touch exfiltrated dumps — possessing stolen data is a separate legal problem and poisons the case.

### Pipeline Sketch
```
1. SAM.gov Entity Extracts API
   → Filter to DFARS/NIST active attestations
   → Extract: entity_name, dba_names, domains, attest_date, contract_start, contract_end
   
2. Ransomware leak metadata
   → RansomLook API (if available) or scrape victim lists
   → Extract: victim_name, victim_domain, breach_date, ransom_group
   → Extract: ransomwatch + group homepages
   
3. Entity resolution
   → Embed SAM entities: f"{entity_name} {domains}"
   → Embed ransomware victims: f"{victim_name} {victim_domain}"
   → FAISS/HNSW index: SAM entities
   → Query: each ransomware victim → k=5 nearest SAM entities
   → Manual dedupe: subsidiary chains, aliases, false positives
   
4. Time join
   → breach_date ∈ [contract_start, contract_end + 90 days]
   → Filter to contracts valued >$1M (FCA jurisdictional significance)
   
5. Output schema
   → sam_entity_id, entity_name, domains
   → nist_attestation_date, contract_id, contract_value
   → breach_victim_name, breach_date, breach_group
   → similarity_score, manual_confidence (high/medium/low)
   
6. Filter for FCA submission
   → Exclude entities with public breach disclosure (clears public-disclosure bar)
   → Exclude first-filer existing qui tams
   → Rank by contract_value × similarity_score
   → Candidate list for FOCUS.dataminers@usdoj.gov submission
```

### Open Questions for Next Pass
- SAM.gov API fields: exact schema for NIST/DFARS filtering, historical attestation versioning
- RansomLook data licensing: can you scrape, is there an API, are there size limits?
- Per-contract breach disclosure: which databases track public breach reporting vs. silent breaches?
- Similarity threshold: what's the manual review burden if you set threshold at 0.75 vs. 0.90?

### The Hard Ethics Line
Only touch leak-site metadata (victim names, dates, technical indicators like domains/IPs). Never download or process exfiltrated data (customer records, credentials, source code). Possessing stolen data is its own legal problem—even if you never distribute it, law enforcement can infer knowledge of theft, and it poisons the case. The qui tam doesn't need the dumps; it needs the *fact of the breach*.

---

## Route B: ICE Per-Diem × Documented Understaffing (Demonstrator)

**Legal viability: MEDIUM-HIGH | Compute intensity: LOW | Your hardware advantage: NONE | Public-disclosure risk: MEDIUM**

### Why Build This
Route B is the validation demonstrator. It proves the "certification vs. reality" methodology on a case where ground truth is jury-decided (Nwauzor: CoreCivic admitted fraud). That's exactly the analytical rigor FOCUS prioritizes for pre-filing diligence.

### The Certification
- **Who:** GEO Group, CoreCivic (ICE detention facility contracts)
- **What:** Staffing-level certifications under Performance-Based National Detention Standards (PBNDS)
- **Why it's falsifiable:** Per-diem billing premised on certified staffing levels

### The Contradiction
- **Staffing reality:** ODO/OIG inspection PDFs on ICE.gov document actual staffing vs. contract-mandated levels
  - Example: one facility documented at 54% of contract-required staffing
  - Nwauzor v. CoreCivic: sworn CFO admission of ~85 missing FTEs (jury-decided, not just alleged)
- **Billing driver:** Deportation Data Project provides daily detention population (Oct 2022 – March 2026)
  - Per-diem = headcount × daily rate
  - Overbilling = (full staffing rate × headcount) when actual staffing < certified
- **Scale:** Multiple facilities, years of billing, millions in overbilling

### Why This Route Is Hard to File
The theory is real, but there's a direct cautionary precedent:

**CoreCivic, Idaho State Correctional Center (2013–2015):**
- CoreCivic admitted falsifying ~4,800 staffing hours
- KPMG audit: actual hours = 26,000+ (overbilled by a factor of 5+)
- FBI investigation (15 months) **declined to prosecute**
- Reason given: "low-level employees with no intention of defrauding"
- FCA consequence: **scienter (knowing falsity) was absent**, so intent-based dismissal stuck

**This is the exact theory you'd build, tried against the exact defendant, and it lost on intent.** That's not a bug—it's a real constraint. FCA requires *knowing* falsity. "Payroll staff fudged timesheets because of bad processes" isn't enough; you need to show *deliberate* misstatement, which is harder when staffing records live in multiple systems and facilities have legitimate excuse-making (turnover, hiring freezes, emergency absences).

### What Makes This Still Worth Building
1. Nwauzor changed the facts: the CFO's sworn admission of missing FTEs is non-public knowledge that an insider brought; a data-miner can use it as anchor evidence
2. It's a proof-of-concept: if you can show "per-diem billing × headcount - (actual staffing × headcount) = overbilling" systematically across facilities, that's the analytical foundation; intent follows
3. Scope: limits relator risk—you're not claiming scienter alone; you're saying the gap is *so large and so documented* that negligence crosses into recklessness or knowing conduct

### Data Sources (Laptop-Scale)
- Deportation Data Project: free, daily detention population by facility
- ODO inspection reports: PDF table extraction, no API
- ICE.gov staffing disclosures: minimal, but searchable
- Nwauzor case record: public PACER

**Compute:** Table extraction + headcount join. A laptop does it in an afternoon. No GPU needed.

### Pipeline Sketch
```
1. Ingest Deportation Data Project
   → Daily population by facility_id, date
   
2. Extract ODO inspection staffing gaps
   → Scrape ICE.gov ODO reports (PDF)
   → Extract: facility_id, inspection_date, certified_positions, actual_staffing, gap_pct
   
3. Join to per-diem contract rates
   → ICE contract database: facility_id → daily_rate
   → Nwauzor CFO admission: total missing FTEs (aggregate anchor)
   
4. Calculate overbilling
   → For each facility-month:
     → overbilling = daily_rate × (certified_staff - actual_staff) × days_in_month × avg_headcount
   → Aggregate by contractor, contract period
   
5. Sensitivity: scienter risk
   → What's the largest gap where negligence/bad process is still a reasonable defense?
   → What's the smallest gap where the data alone suggests intent?
   → Nwauzor CFO evidence bridges this: admitted intent at some facilities
```

### Public-Disclosure Bar Risk: HIGH
GEO/CoreCivic understaffing is massively public:
- Congressional hearings (multiple)
- ProPublica, The Intercept investigations
- OIG reports (public)
- Nwauzor (already litigated and settled)

A qui tam relator filing on public allegations faces the **public-disclosure bar**: an existing suit must exist, and the relator must be the "original source" of the allegations. Courts have held that "specialized expertise applied to public information" does NOT make you an original source. You mining public ICE population data + public ODO reports is that exact fact pattern.

**Bottom line:** Build it to validate the method, but file it only if you have non-public knowledge (worked at a facility, have insider corroboration) to clear the original-source exception.

---

## Route C: Oracle/Cerner SLA Credits and Defect Disclosure (Insider Play, Not Data)

**Legal viability: MEDIUM | Compute intensity: NONE | Your hardware advantage: IRRELEVANT | Data-mining barrier: DECISIVE EVIDENCE IS NOT PUBLIC**

### Why This Route Doesn't Yield to Data Mining
- **The falsifiable certification:** SLA credit records, defect-disclosure timelines, warranty claims
- **The contradiction:** Alleged non-disclosure of known defects during SLA compliance windows
- **The problem:** Those records are *inside the government and the contractor*. They're FOIA-able, not minable from public data.
- **Evidence that already exists:** VA OIG reports document the issue; the concealment finding is already public-domain (public-disclosure-bar risk)
- **Biggest dollar figure:** $10B+ alleged fraud (largest of the four routes)

### What This Needs
Insider knowledge: someone from VA, Oracle, or Cerner with access to SLA records, contract amendments, defect logs, and timeline evidence. You can't synthesize that from public data.

### Action Instead of Mining
If you encounter FCA counsel or connect with a former VA/Oracle/Cerner employee: package this as an **insider referral**, not a data-mined case. Your job is to help them identify the legal theory and datasources they'll need inside; compute doesn't help.

---

## Route D: MOHELA Loan-Servicing Fraud (Insider Play, Not Data)

**Legal viability: MEDIUM | Compute intensity: NONE | Your hardware advantage: IRRELEVANT | Data-mining barrier: EVIDENCE IS INSIDE THE AGENCY**

### Why This Route Doesn't Yield to Data Mining
- **The falsifiable certification:** Loan-account accuracy, borrower eligibility for income-driven repayment, interest calculation
- **The contradiction:** Alleged systematic errors that inflate borrower payments or deny eligible relief
- **The evidence:** FSA's internal Red/Yellow/Green scorecards (performance audits). These are not public.
- **What's public:** ED's $7.2M withholding of MOHELA payments (April 2023); the fact of the problem
- **Ground truth:** ED already has the evidence; the agency is acting on it

### What This Needs
An FSA, MOHELA, or ED insider who can bring loan-servicing records, account data, or audit reports. The qui tam doesn't create the case—the insider does. The $7.2M withholding proves government already knows; you can't add new knowledge from outside.

### Action Instead of Mining
Flag this to FCA counsel as an insider-referral lead. If you have a contact at FSA or MOHELA, this is their case to bring, not yours to mine.

---

## The Hard Legal Filter: Why Public Notoriety Is a Liability

### The Integra Med Analytics Rule
Courts dismiss qui tams based on pure statistical outliers if the plaintiff can't rule out innocent explanation. This pushes you toward cases where:
1. The certification is specific and written
2. The contradiction is specific and verifiable
3. The gap cannot be innocent variation

Example (Integra): 2% of a provider's billings were anomalous. Defendant argued "some billing staff just code things wrong; we have training but it happens." Court agreed—innocent explanation exists, motion to dismiss granted.

Example (your Route A potential): A contractor self-certified NIST encryption controls and appears in a ransomware breach. Defendant's "innocent explanation" (encryption was implemented but attacker got through anyway) doesn't hold—NIST controls include perimeter defense, segmentation, incident response. A breach is prima facie evidence at least one control was absent. Innocent explanation fails.

### The Public-Disclosure Bar + Original-Source Exception
- **Public-disclosure bar:** If the allegations are already publicly known, a qui tam suit based on them is barred *unless* the relator is the "original source" of those allegations.
- **Original-source exception:** You must be someone with *direct* knowledge of the fraud (worked there, saw it, know about it) *before it became public*.
- **The trap for data miners:** Courts have repeatedly held that applying specialized expertise (data analysis, machine learning) to publicly known information does NOT make you an original source.
  - One relator who built a patent-infringement case by analyzing public patent filings + sales data was thrown out on original-source grounds.
  - Your building a case by analyzing public ICE population data + public ODO staffing reports follows the same fact pattern.

### Why Public Notoriety Kills Data-Mining Relators
The more famous and notorious a fraud is, the worse a public-data-mining relator does. Paradoxically:
- **GEO/CoreCivic understaffing:** Massively public (congressional hearings, ProPublica, Nwauzor). Data-miner relator = barred at threshold.
- **Oracle/Cerner SLA credits:** Public-disclosure risk flagged in VA OIG reports. Data-miner relator = barred.
- **Cyber attestation × breaches (Route A):** Each breach is initially private (victim hasn't disclosed it yet). The qui tam *uncovers* the breach-attestation link before public knowledge. Data-miner relator = has original-source credibility because the *connection* is novel, even if the breach is later known.

**The lesson:** FOCUS invites data miners, but Integra + original-source case law means public-data-only relators mostly succeed on things that aren't already all over the news. You need either:
1. Non-public knowledge (worked there, know about it firsthand)
2. A novel analysis that connects public datasets in a way that contradicts a *newly discovered* certification
3. Real FCA counsel at a contingency-fee firm to navigate the bars before you invest

### When You Can Actually Contribute
#### What does NOT work (data-miner alone, public data):
- Cases already litigated or famous (GEO, MOHELA, Oracle/Cerner)
- Allegations that are already notorious (understaffing at ICE detention)
- Theories that require inside knowledge (FDA defect timelines, FSA loan audits)

#### What DOES work (data-miner alone, public data):
- **Route A:** Breaches that aren't yet widely known (or aren't yet linked to specific NIST attesters)
- A certification that is newly public or newly findable (e.g., SAM bulk attestations became searchable recently)
- A contradiction in datasets that are both public but not yet cross-referenced
- The analysis itself is novel enough that the insights are original-source material

#### What absolutely requires an insider:
- Routes C and D (Oracle/Cerner, MOHELA): decisive evidence is inside the agency or contractor
- Any case where the smoking gun is a contract amendment, internal memo, defect log, or audit report
- If you lack direct knowledge of the fraud, you're not the original source

---

## Data Availability and Network Constraints

**Network test (2026-07-04):** Environment tested for direct access to:
- USAspending.gov — blocked (connect_rejected)
- data.cms.gov — blocked (connect_rejected)
- open.gsa.gov — blocked (connect_rejected)
- Deportation Data Project — blocked (connect_rejected)
- ransomware.live — blocked (connect_rejected)

**Implication:** Data ingestion must run on your own rig (not inside Claude environment). WebSearch works; direct API fetches do not.

**What this means for Route A:** You'll download SAM bulk files locally, scrape ransom-group victim lists on your own hardware, and run embeddings + FAISS locally. The pipeline design + endpoint specs + schema docs are what this project can provide; execution is yours.

---

## Recommendation: What to Build and When

### Phase 1: Route A (Flagship)
**When:** After setting up local SAM.gov entity extract and RansomLook metadata ingest
**Effort:** Embedding + HNSW index, ~4–8 GPU-hours
**Output:** Candidate list of DoD contractors with NIST attestations who appear in breach corpus (filtered to non-public breaches, time-joined to contract period)
**Next:** Submit top-50 candidates to FOCUS.dataminers@usdoj.gov with full methodology + sensitivity analysis
**Why:** This is the only route where your hardware is the bottleneck, the legal bars are navigable, and government track record shows it works.

### Phase 2: Route B (Demonstrator)
**When:** After Route A is running, as a secondary analytical validation
**Effort:** Laptop-scale, one afternoon
**Output:** Per-facility overbilling estimates (ICE per-diem × understaffing gap), anchored to Nwauzor CFO admission
**Next:** Use this to validate your "certification vs. reality" methodology; don't file it without insider corroboration (original-source risk)
**Why:** It proves the analytical pattern works on a case where the ground truth is jury-decided; that's gold for pre-filing diligence with real FCA counsel.

### Phase 3: Routes C & D
**When:** You find an insider or connect with FCA counsel
**Effort:** Package these as insider-referral leads, not data-mining plays
**Output:** Briefing document for counsel on legal theory, relevant datasources (FOIA targets), what an insider would need to bring
**Why:** Your job is to help FCA counsel identify what evidence exists, not to manufacture the evidence yourself.

---

## Next Steps

1. **Verify Route A feasibility:** Confirm SAM.gov API schema, RansomLook data licensing, per-contract breach-disclosure database availability
2. **Set up local ingestion:** Download SAM entity extracts, scrape ransom-group victim lists, test SPECTER2 embedding pipeline
3. **Socialize with FOCUS:** Send preliminary inquiry to FOCUS.dataminers@usdoj.gov with Route A methodology + estimated candidate count (before full submission)
4. **Connect with FCA counsel:** Contingency-fee firms (Constantine Cannon, Phillips & Cohen, Kirby McInerney, others) have FOCUS connections and can advise on original-source / public-disclosure risk before you file
5. **Route B as proof-of-concept:** Run per-diem analysis as a secondary validation of your methodology; don't file without insider corroboration

---

## Open Questions

- SAM.gov: Which API endpoint has bulk NIST/DFARS attestations? How far back does historical versioning go? Can you filter by effective date?
- RansomLook: Is there a public API? Scraping limitations? Do they sell historical data dumps?
- Ransomware metadata: Which sources have the cleanest victim-name + domain extraction? How much manual dedupe is required?
- Per-contract disclosure: Does any database track "this breach was publicly disclosed" vs. "quiet breach"?
- Similarity threshold tuning: At what threshold does false-positive rate become unmanageable?
- FCA counsel: Which firms have FOCUS track record and offer free initial consultation on data-mining cases?
