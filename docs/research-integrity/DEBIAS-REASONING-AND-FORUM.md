# De-biasing, cross-source reasoning, and the Science Forum Hub direction

*Reference/design note. Not legal advice.*

## 1. Removed the nationality bias (done, tested)

The old foreign-funding detector added +20 to the score when the country was CN/RU/IR.
That is, in effect, "flag the Chinese name." It has been **removed entirely**. Nationality
/ country of origin is now **never** a scoring input.

Why this is strictly better:
- **Ethics:** we do not target people by nationality or ethnicity.
- **Law/accuracy:** the NIH duty is to disclose **all** foreign support regardless of
  country. The violation is *non-disclosure*, not the country. A country boost both
  misstated the rule and manufactured false positives on ordinary international
  collaboration.
- **Proven:** `verify-foreign-funding` asserts identical evidence differing only in
  country (CN vs GB vs DE) yields an **identical score**.

New score = **corroboration only**: number of concurrent foreign-support items, number
of independent source-types, number of distinct foreign entities. A lone, uncorroborated
foreign affiliation now scores low (≤30) and is flagged "likely benign, low priority."

## 2. Cross-source reasoning (done, tested)

`corroborate.ts` aggregates every signal about one subject and reasons across them:
- A **single detector**, however high its raw score, is **capped at 60** and flagged
  "seek independent corroboration before escalating."
- **≥2 independent detectors** agreeing raises combined confidence above the cap.
- `corroborateAll` groups by subject and ranks by corroborated confidence.

This directly answers "not intelligent on checking multiple sources / reasoning" — thin,
single-source hits can no longer escalate on their own. It stacks with the ethics triage
(small entity / individual / public-benefit → "notify first").

## 3. Outside-the-box scope (already live)

Non-scientific / government-contract coverage is already in the pipeline:
- `general_federal_award` (USASpending), first-tier **sub-awards**, **debarred**
  recipients/subs, healthcare **excluded providers**, **duplicate awards** + **shell/
  affiliated recipients** (dedupe agent).
- **OCDS** connector = 50+ countries' procurement through one schema.
- Programs beyond FCA: SEC, CFTC, IRS, FinCEN, DOJ Corporate Pilot, DOJ Antitrust,
  state FCAs — with US-only defaults and non-US opt-in.

## 4. Science Forum Hub — the legitimacy engine (roadmap)

The relator operation is far more credible sitting under a legitimate, public
open-science + research-integrity institution than as a bare bounty scanner. This repo
already *is* a science forum (papers / reviews / profiles). Making it genuinely capable
and legitimate makes the whole enterprise more legitimate.

Direction:
- **Post-publication review + integrity flags** (PubPeer-style) on the existing
  papers/reviews tables — the lawful, transparent public-disclosure trail.
- **AI checkers as first-class citizens:** image-duplication (our hardened stack),
  statistical anomaly (Benford / impossible replication), methods/reproducibility, and a
  **mathematical proof checker**.
- **Mathematics / Principia Mathematica space:** formal-proof sharing with AI + formal
  proof-checkers (Lean / Coq) — a "Principia" area for foundational math and machine-
  verified proofs. This is legitimacy *by construction*: verifiable truth, not opinion.
- **Governance:** published methodology, appeals, human-in-the-loop, and "probable cause,
  not proof" everywhere. Neutral, multi-source, ethics-triaged. Legitimacy is the moat —
  credibility with DOJ/FOCUS, journals, and courts.

Suggested phases:
- **P1** — surface integrity flags + AI-checker results on the existing papers/reviews UI.
- **P2** — math forum + a Lean/Coq proof-checker microservice.
- **P3** — public transparency portal (methods, governance, appeals).

Guiding rule everywhere: **country-neutral, multi-source, human-reviewed, published
methodology.** That is what turns a scanner into an institution.
