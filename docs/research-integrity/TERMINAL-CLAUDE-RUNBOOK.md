# Terminal-Claude runbook: running the live hunt on an open-internet machine

*For Claude Code (or you) running in a normal terminal where outbound HTTPS works.
The cloud/dev sandbox blocks every data endpoint (all CONNECTs return 403), so live
scanning happens here, on your machine. Not legal advice. Every output is **probable
cause for review, not a finding** — see the ethics gate at the end.*

## 0. Why "get through" is a non-issue here

There is nothing to bypass. The block only exists in the managed sandbox, whose proxy
refuses outbound sockets. On your own machine the public APIs and bulk files below are
free and open — no keys, no Sci-Hub, no mirrors needed. The whole pipeline is built on
**open** data by design (OpenAlex, Europe PMC open-access, NIH ExPORTER, USASpending,
SBA FOIA, state DOT bid tabs). If a specific host ever is blocked on your network, the
fix is your network, not a workaround in this code.

## 1. Preflight

```bash
# from the repo root
node -v            # need Node 24+
pnpm install
pnpm run typecheck  # whole workspace must compile

# confirm egress actually works (should print 200s, not 403/000):
for u in \
  https://api.openalex.org/works?per-page=1 \
  https://api.reporter.nih.gov/v2/projects/search \
  https://api.usaspending.gov/api/v2/references/agency/456/ \
  https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=test\&format=json\&pageSize=1 ; do
  printf '%s  %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$u")" "$u"
done

export OPENALEX_MAILTO="you@example.org"   # OpenAlex "polite pool"; be a good citizen
```

Offline sanity check (no network) — the engine firing on real public figures:

```bash
pnpm --filter @workspace/extrapolator run scan-known-cases
# reproduces the three worked cases: GRIM (Brown&Heathers/Wansink),
# PPP per-job + same-address clustering (ProPublica), UK CMA demolition bid rigging.
```

## 2. Live runs, detector by detector

### 2.1 Fabricated statistics (the GRIM / "data thug" path — case #1)
The offline harness already GRIM-tests real means. To go live over a body of papers:
harvest open-access full text via Europe PMC, pull reported `mean (SD), n` triples
from results tables, and feed them to `detectFabricatedStats`. Start from a lab/author
you have reason to check (a PubPeer thread, a correction notice), never a fishing
expedition. For image duplication in the same papers, use §2.5.

### 2.2 PPP anomalies (case #2)
```bash
# one-time: download the SBA FOIA loan-level CSVs (public, ~1GB total)
#   https://data.sba.gov/dataset/ppp-foia   -> public_150k_plus_*.csv + up_to_150k_*.csv
# then run the parser+detector over a slice (write a tiny driver or extend scan-recipient):
```
```ts
import { readFileSync } from "node:fs";
import { parsePppCsv, buildPppIndex } from "@workspace/integration-sba-ppp";
import { detectPppAnomalies } from "@workspace/extrapolator";

const recs = parsePppCsv(readFileSync("public_150k_plus_230101.csv", "utf8"));
const idx = buildPppIndex(recs);
for (const s of detectPppAnomalies(recs, idx)) console.log(s.score, s.reason);
// per-job impossibilities, >2 draws at one name+address, forgiveness overruns.
// For the "different names, same address" affiliation lead, cluster idx.byAddress
// (that IS ProPublica's method) then join public affiliate headcounts to confirm.
```

### 2.3 Bid-rigging screens (case #3)
US bid-level data (winner **and** losers) is not centralized. Two sources:
- **State DOT letting results** — each state posts full bid tabulations (e.g. WSDOT,
  TxDOT, NYSDOT). Scrape a season of lettings into `Tender[]` (`bidder`, `amount`).
- **OCDS** (50+ countries) via `@workspace/integration-ocds` for non-US procurement.
```ts
import { detectBidRigging, type Tender } from "@workspace/extrapolator";
const tenders: Tender[] = loadLettings(); // {tenderId, bids:[{bidder,amount}], winner?}
const sig = detectBidRigging("Region X paving contractors", tenders);
if (sig.fired) console.log(sig.score, sig.reason); // >=2 concordant screens only
```

### 2.4 Federal awards, debarment, exclusions, dedupe (already wired CLIs)
```bash
pnpm --filter @workspace/extrapolator run scan-recipient  -- "Some Contractor Inc"
pnpm --filter @workspace/extrapolator run scan-provider   -- --npi 1234567890
pnpm --filter @workspace/extrapolator run scan-subawards   -- "Some Prime Corp"
# SAM exclusions + OIG LEIE are bulk CSVs (sam.gov Data Services; oig.hhs.gov/exclusions).
```

### 2.5 Foreign-funding disclosure (research integrity, country-neutral v2)
```bash
OPENALEX_MAILTO=you@example.org \
  pnpm --filter @workspace/extrapolator run detect-foreign-funding -- "First Last" --funders
OPENALEX_MAILTO=you@example.org \
  pnpm --filter @workspace/extrapolator run validate-foreign-funding   # precision/recall
```

### 2.6 Image duplication + cross-literature index (ImageTwin path)
```bash
cd services/image-forensics
pip install -r requirements.txt          # opencv, imagehash, numpy, pillow; torch optional
python harvest_figures.py 'AUTH:"Some Author" AND OPEN_ACCESS:y' ./corpus 500
python embedding_index.py build ./corpus ./corpus_index   # segments panels + embeds
python embedding_index.py query ./corpus_index suspect_panel.png   # top-k leads
# confirm any lead with the geometry check:
python advanced_detector.py ./corpus/<article>/   # pHash + ORB/RANSAC + flip + copy-move
```

### 2.7 Multi-domain sweep (convenience wrapper)
```bash
bash scripts/ri-fullscan.sh --recipient "Some Contractor Inc" --scale small --public-benefit yes
bash scripts/ri-fullscan.sh --pi "First Last"
# --scale / --public-benefit feed the ethics triage (§4).
```

## 3. Corroborate before you believe anything

Never escalate on one detector. Pass all signals about a subject through the
cross-source layer:
```ts
import { corroborateAll } from "@workspace/extrapolator";
const ranked = corroborateAll(allSignals);   // single-source hits are capped at 60
```
A lone hit is a lead to verify; ≥2 independent detectors agreeing is what earns
attention. This mirrors DOJ FOCUS's stated preference for pre-filing rigor.

## 4. Ethics + legal gate (do this every time, before contacting anyone)

1. **Lead, not verdict.** The decisive document (NIH Other Support page, sealed bid
   exhibit, payroll certification) is usually non-public. Say "probable cause."
2. **Country-neutral / identity-neutral.** Nationality is never a score input (v2).
   Don't reintroduce it, and don't let a name or origin drive suspicion.
3. **Run the triage.** `triage.ts` downweights small entities, individuals, and
   public-benefit orgs toward "notify first" rather than "escalate."
4. **Verify the innocent explanations.** Several worked cases (Homecare Therapies'
   temps; legitimate affiliates sharing an address) had real defenses. Chase them
   down before acting.
5. **First-to-file + seal + original-source.** Qui tam is filed under seal; the
   public-disclosure bar and original-source exception (31 U.S.C. §3730(e)(4)) govern
   whether a data-miner relator can proceed. This is counsel's call — loop in the
   lawyer before filing, and log your original-source basis (`ri_original_source_log`).
6. **US = qui tam; elsewhere = tip-reward.** `programs.ts` maps each domain to the
   right program and only defaults to US FCA when the award is US-federal.

## 5. What to hand a human / counsel
For any corroborated, ethics-cleared lead, generate the case package:
```ts
import { assembleGeneralCase, renderGeneralCase } from "@workspace/extrapolator";
// signal -> program + reward + triage; renderGeneralCase() emits the Markdown package.
```
It descends from signal to named documents (the asphalt relators filed identified
copied submissions, not "statistics") and includes the "Ethics & handling" section.
