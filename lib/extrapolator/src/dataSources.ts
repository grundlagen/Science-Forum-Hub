// Catalog of public contract / award / funding databases the scanner can ingest.
// Reference data (no network). "subawards" = company-to-company (prime -> sub) links,
// which open new detectors (pass-through fraud, debarred sub, affiliated self-dealing).
import type { Jurisdiction } from "./programs";

export interface DataSource {
  id: string;
  name: string;
  jurisdiction: Jurisdiction | "GLOBAL";
  url: string;
  kind: "awards" | "tenders" | "exclusions" | "payments" | "grants" | "subawards" | "registry";
  standard: string | null; // e.g. "OCDS" where applicable
  hasSubawards: boolean;
  access: string; // how to get it programmatically
  connector: string | null; // implemented connector package, if any
}

export const DATA_SOURCES: DataSource[] = [
  // ---- United States ----
  {
    id: "usaspending",
    name: "USASpending.gov (federal awards + first-tier sub-awards)",
    jurisdiction: "US",
    url: "https://api.usaspending.gov",
    kind: "awards",
    standard: null,
    hasSubawards: true, // FSRS sub-award data (now via SAM) is exposed per prime award
    access: "Public REST API, no key.",
    connector: "@workspace/integration-usaspending",
  },
  {
    id: "sam_exclusions",
    name: "SAM.gov Exclusions (debarment) + sub-award reporting",
    jurisdiction: "US",
    url: "https://sam.gov",
    kind: "exclusions",
    standard: null,
    hasSubawards: true, // FSRS retired Mar 2025; sub-award reporting moved to SAM
    access: "Public Exclusions Extract CSV (no key); Entity/Exclusions API needs a key.",
    connector: "@workspace/integration-sam-exclusions",
  },
  {
    id: "fpds",
    name: "Federal Procurement Data System (contracts)",
    jurisdiction: "US",
    url: "https://www.fpds.gov",
    kind: "awards",
    standard: null,
    hasSubawards: false,
    access: "ATOM feed; public-facing site migrating into SAM.gov.",
    connector: null,
  },
  {
    id: "cms_data",
    name: "CMS open data (Medicare Part D / Open Payments / utilization)",
    jurisdiction: "US",
    url: "https://data.cms.gov",
    kind: "payments",
    standard: null,
    hasSubawards: false,
    access: "Public data-api; dataset ids change by release.",
    connector: "@workspace/integration-cms",
  },
  {
    id: "oig_leie",
    name: "OIG LEIE (excluded individuals/entities)",
    jurisdiction: "US",
    url: "https://oig.hhs.gov/exclusions/",
    kind: "exclusions",
    standard: null,
    hasSubawards: false,
    access: "Public monthly CSV (no key).",
    connector: "@workspace/integration-oig-leie",
  },
  {
    id: "nih_reporter",
    name: "NIH RePORTER / ExPORTER (research grants + publications)",
    jurisdiction: "US",
    url: "https://api.reporter.nih.gov",
    kind: "grants",
    standard: null,
    hasSubawards: true, // subprojects / multi-PI components
    access: "Public REST + bulk ExPORTER link tables.",
    connector: "@workspace/integration-nih-reporter",
  },
  // ---- Other jurisdictions (procurement) ----
  {
    id: "eu_ted",
    name: "EU Tenders Electronic Daily (TED)",
    jurisdiction: "EU",
    url: "https://ted.europa.eu",
    kind: "tenders",
    standard: "eForms / OCDS-compatible",
    hasSubawards: false,
    access: "Public API + bulk (~700k notices/yr).",
    connector: null,
  },
  {
    id: "uk_fts",
    name: "UK Find a Tender + Contracts Finder",
    jurisdiction: "UK",
    url: "https://www.find-tender.service.gov.uk",
    kind: "tenders",
    standard: "OCDS",
    hasSubawards: false,
    access: "Public OCDS API (Contracts Finder publishes from £12k/£30k).",
    connector: null,
  },
  {
    id: "ca_canadabuys",
    name: "CanadaBuys / federal contract history",
    jurisdiction: "CA",
    url: "https://canadabuys.canada.ca",
    kind: "tenders",
    standard: "OCDS",
    hasSubawards: false,
    access: "Open data downloads + proactive disclosure of contracts.",
    connector: null,
  },
  {
    id: "global_ocds",
    name: "Open Contracting Data Standard (50+ governments)",
    jurisdiction: "GLOBAL",
    url: "https://standard.open-contracting.org",
    kind: "tenders",
    standard: "OCDS",
    hasSubawards: false,
    access: "One schema across 50+ portals (Mexico, Colombia, Ukraine, UK, Australia, Kenya, Brazil...). A single OCDS parser ingests many countries.",
    connector: null,
  },
  // ---- Corporate identity / ownership (for shell / affiliated-recipient graphs) ----
  {
    id: "opencorporates",
    name: "OpenCorporates (company registry, 140+ jurisdictions)",
    jurisdiction: "GLOBAL",
    url: "https://opencorporates.com",
    kind: "registry",
    standard: null,
    hasSubawards: false,
    access: "API (key/licence for bulk).",
    connector: null,
  },
  {
    id: "opensanctions",
    name: "OpenSanctions (sanctions / PEP / watchlists)",
    jurisdiction: "GLOBAL",
    url: "https://www.opensanctions.org",
    kind: "registry",
    standard: "FollowTheMoney",
    hasSubawards: false,
    access: "Bulk data + API.",
    connector: null,
  },
];

export function dataSourcesByJurisdiction(j: DataSource["jurisdiction"]): DataSource[] {
  return DATA_SOURCES.filter((d) => d.jurisdiction === j);
}
export function subawardSources(): DataSource[] {
  return DATA_SOURCES.filter((d) => d.hasSubawards);
}
