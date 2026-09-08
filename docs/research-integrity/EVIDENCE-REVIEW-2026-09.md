# Evidence review — 8 September 2026

The FOCUS gate is an internal completeness heuristic, not DOJ's scoring system.
The existing implementation could pass claim particularity without confirmed identity
or dates, because other points compensated for those missing facts. Those checks now
require every component.

Promotion to `meeting_worth_counsel` also requires nonblank evidence references with
claim-specific explanations for falsity, knowledge and materiality, and confirmation
that the program rule applies to the entity, claim and relevant date. Known resolved
matters remain benchmarks. Old callers can omit the added input fields, but then cannot
receive the highest readiness label. The numerical score remains a heuristic and may
be 100 while evidence gaps prevent promotion. The renderer exposes those gaps.

These are data-completeness checks. They neither validate the truth of supplied
references nor determine legal sufficiency. Counsel can usefully be consulted at any
stage, including before this heuristic passes.

## Legal corrections
- Under [31 USC 3729](https://www.law.cornell.edu/uscode/text/31/3729),
  absence of a specific-intent requirement does not eliminate knowledge.
- [31 USC 3730](https://www.law.cornell.edu/uscode/text/31/3730) governs the
  public-disclosure bar, original-source exception, first-to-file restriction and
  seal procedure. A negative public docket search cannot exclude a sealed case.
  A human reviewing public data does not automatically become an original source.
- [DOJ FOCUS](https://www.justice.gov/opa/pr/civil-division-announces-focus-initiative-data-miners-filing-qui-tam-complaints)
  welcomes rigorous data analysis; participating is not a statutory safe harbour.

## Investigation discipline
Separate source-established facts, research hypotheses, agency findings, pending
allegations and resolved benchmarks. Record conflicting and exculpatory facts.
An award amount is not proven damages or a predicted relator payment.
For PPP, preserve loan/application/forgiveness dates, legal borrower identity,
repayment status, rule version and legitimate eligibility explanations.
For research, verify original panels and captions, reused controls or cited datasets,
and the specific federal submission rather than inferring liability from funding
acknowledgments. Named exploratory leads belong in the internal dossier.

## Validation
23 assertions passed using Node 24's TypeScript stripping on the gate and verification
script. Tests cover legacy thin input, worked-up synthetic input, unresolved identity,
missing dates/entities/claims, missing or blank evidence, unverified rule applicability,
and resolved matters. Full workspace typecheck and live ingestion were not run.
