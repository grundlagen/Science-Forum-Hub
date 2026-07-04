# Entity-resolution spec — the cross-cutting fix

Per `RELATOR-JSON-REVIEW.md`, three of five non-GRIM detectors (grant-vs-grant, benford,
retraction-cluster) fail for the same root reason: no person/award identity layer. This spec
outlines the minimum entity-resolution stack needed before any of those detectors can
produce attorney-grade output.

## Goal

For every mention of a person or an award in our corpora, produce a **stable canonical id**.

- People: canonical `person_id` linking every author-mention, PI-mention, ORCID, RePORTER
  profile_id, funder acknowledgement string. No mention-of-string surviving downstream.
- Awards: canonical `award_id` linking every OpenAlex `award_id` fragment, RePORTER core
  project number, USASpending FAIN/PIID, and free-text acknowledgement string.

## Data joins available

| Source | Person key | Award key | Notes |
|---|---|---|---|
| OpenAlex works | `authorships[].author.id` (A-id), ORCID (partial) | `awards[].funder_award_id` (dirty free-text) | Author-id has ~200M nodes, disambiguated by OpenAlex. Award strings need normalisation. |
| NIH RePORTER | `principal_investigators[].profile_id` | `core_project_num`, `appl_id` | Profile_id is authoritative when present. Core project = canonical award. |
| USASpending | `recipient_uei` (org, not person) | FAIN, PIID | Not person-level; joins at org level. |
| Retraction Watch | free-text author name | free-text funder | Weakest; needs external join. |
| OpenAlex authors | `id`, `orcid`, `display_name`, `affiliations` | — | Use OpenAlex A-id as canonical author key when available. |

## Person canonicalisation — priority order

1. **ORCID** (highest — global unique). Where present in either OpenAlex or RePORTER,
   pin to ORCID.
2. **OpenAlex Author-id** (A-id). Second best — OpenAlex has spent effort disambiguating.
3. **RePORTER profile_id**. Best for PI mentions in grants; join to OpenAlex A-id via
   (name + affiliation + funder overlap).
4. **Name + affiliation + funder-overlap heuristic**. Last resort. Do NOT collapse by
   name-string alone (the "Ju Li" / "Wei Li" failure).

Concrete lookup table: `people` (id, orcid, openalex_aid, reporter_profile_id,
canonical_display_name, primary_affiliation, confidence). Populate from OpenAlex authors
API for A-ids we hit, join RePORTER profile_ids in a second pass on (last_name +
affiliation + funder_id).

## Award canonicalisation

RePORTER `core_project_num` is authoritative for NIH. Map every noisy OpenAlex
`funder_award_id` string to a core project by:

1. Regex-strip prefix/suffix (activity code, IC letters, serial number pattern).
2. Look up in a RePORTER-derived index of known core numbers.
3. If no match, keep string but flag as unresolved.

Concrete table: `awards` (id, funder, core_project_num, activity_code, ic, serial,
budget_start, budget_end, canonical_pi_ids, unresolved_raw_strings[]).

## Detector rewrites once entity resolution lands

- **retraction_cluster**: aggregate by `person_id`, not name string. Dedup retraction
  records by DOI. Expected drop: 3 flagged (all name collisions) → likely 0–3 real.
- **benford**: aggregate reported statistics by `person_id`. Exclude author entries
  whose only mentions are in ≥100-author collaboration papers (CMS/DES etc.). Restrict
  input to reported summary statistics via the GRIM extractor. Expected drop from 91%.
- **grant_shortlist**: `require_same_pi` now uses canonical `person_id`, not name. Also
  reject pairs where the shared PI is on a very-large-lab center grant (P30/P50) where
  boilerplate text appears in multiple sub-projects.

## Implementation phases

1. **Phase A** — build `people` table from OpenAlex authors API for all A-ids in
   works.jsonl. ~1M unique A-ids × 500/batch = ~40 min at 1 rps. Cache to
   `/workspace/mega/entities/people.parquet`.
2. **Phase B** — join RePORTER profile_ids by (last-name, affiliation, funder overlap).
   Store as `people.reporter_profile_id`.
3. **Phase C** — build `awards` table from RePORTER (all core_project_num as canonical).
   Add a normalisation function that maps OpenAlex `funder_award_id` strings to core numbers.
4. **Phase D** — rewrite retraction_cluster, benford, grant_shortlist to consume the
   `people` and `awards` tables. Rerun. Expected: 1–2 orders of magnitude fewer flags,
   with much higher precision.

## Non-goals

- Not building a public entity-resolution system. This is an internal join layer.
- Not solving the general author-disambiguation problem — using OpenAlex's existing
  disambiguation as the base and only doing supplementary joins.
- Not resolving orgs to canonical parents (already done well by ROR / USASpending).

## Owner

To be tackled by the next session with GPU + storage headroom. Weekly token limit hit
in the current session; entity resolution is the highest-leverage remaining work.
