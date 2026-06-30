# Jurisdictions, programs, and public contract data sources

*Research note. Reference data is encoded in `lib/extrapolator/src/programs.ts` and
`lib/extrapolator/src/dataSources.ts`. Not legal advice; verify figures with counsel.*

## The big strategic point: qui tam is essentially US-only

- **United States** is uniquely positioned: the **False Claims Act (qui tam)** lets a
  PRIVATE party file suit and share 15–30% of the recovery. It covers nearly any misuse
  of federal funds — healthcare, defense/procurement, research/other grants, PPP/COVID,
  SBA loans, customs/tariff (reverse FCA), and cybersecurity-compliance.
- **Everywhere else is a tip-reward model** (you report; the agency acts; you may get a
  %), not private enforcement — and mostly limited to **tax** and **securities**.
- **The EU pays no bounty** (the Whistleblowing Directive is protection-only).

## US programs (all in the registry)

| Program | Model | Reward | Domains |
|---|---|---|---|
| FCA (qui tam) | private suit, under seal | 15–25% intervened / 25–30% declined | federal funds: grants, healthcare, procurement, customs, cyber, PPP/SBA |
| SEC / CFTC | tip-reward | 10–30% on sanctions > $1M | securities / commodities |
| IRS | tip-reward | 15–30% when > $2M | tax |
| FinCEN (AML Act) | tip-reward | 10–30% on > $1M | money laundering / sanctions |
| **DOJ Corporate Whistleblower Pilot** (Aug 2024; **expanded May 2025**) | tip-reward, forfeiture-based | up to 30% of first $100M | federal-contracting/funding fraud, customs/tariff, sanctions, immigration, financial-institution crime (and private-plan health) |
| **DOJ Antitrust Rewards** (Jul 2025) | tip-reward | 15–30% of fine ≥ $1M | bid rigging / price fixing, incl. public procurement |
| State FCAs (~30) | private suit | 15–30% | state Medicaid / state funds |

The May-2025 DOJ Corporate Pilot expansion and the new Antitrust program substantially
widen what a contract-scanner can route — especially **bid rigging** and **customs/tariff**.

## Non-US tip-reward programs (registry, opt-in via `{jurisdiction:'all'}`)

| Country | Program | Reward | Scope |
|---|---|---|---|
| Canada | CRA OTIP | 5–15% of tax > CAD 100k | offshore tax |
| Canada | Ontario OSC | 5–15% of sanctions > CAD 1M (cap ~CAD 5M) | securities |
| UK | HMRC scheme (Nov 2025 Budget) | up to 25% of tax recovered | tax (no qui tam) |
| South Korea | NTS | varies | tax (very active) |
| Others | South Korea/Slovakia/Hungary/Poland/Ghana have some reward provisions | varies | mostly tax/anti-corruption |

## Public contract / award / funding databases (in `dataSources.ts`)

- **US:** USASpending.gov (awards **+ first-tier sub-awards**, no key) — connector built;
  SAM.gov (exclusions CSV + sub-award reporting) — connector built; FPDS (contracts);
  CMS data-api — connector built; OIG LEIE — connector built; NIH RePORTER — connector built.
- **Other jurisdictions:** EU **TED** (~700k notices/yr), UK **Find a Tender + Contracts
  Finder** (OCDS), **CanadaBuys** (OCDS), Australia AusTender.
- **Global standard:** **OCDS (Open Contracting Data Standard)** — 50+ governments publish
  to one schema (Mexico, Colombia, Ukraine, UK, Australia, Kenya, Brazil...). **A single
  OCDS parser ingests many countries at once.**
- **Corporate identity / ownership (for shell + affiliated-recipient graphs):**
  OpenCorporates (140+ jurisdictions), OpenSanctions.

## Company-to-company agreements (sub-awards)

US prime contractors/grantees must report **first-tier sub-awards > $30k** (formerly FSRS,
now via SAM), exposed per prime award on USASpending. This is the public "company ->
company" layer and unlocks new detectors: pass-through fraud, a sub that is debarred/
excluded, and affiliated-entity self-dealing. Marked `hasSubawards` in the catalog.

## How this maps to the scanner

- A signal's `domain` -> `programsForDomain(domain)` (US by default) -> reward estimate in
  the case package; pass `{jurisdiction:'all'}` to surface non-US tip-reward options.
- Practical reality: the **monetizable purview is widest in the US**. Foreign procurement
  data is most useful for (a) cross-border fraud that also touches US federal funds (still
  FCA), (b) feeding CA/UK/KR tax/securities programs where the fraud fits, and (c) the
  cross-jurisdiction "one company defrauding several governments" view.
