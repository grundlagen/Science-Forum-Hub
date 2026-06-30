import type { InsertRiGroundTruthCase } from "@workspace/db/schema";

// Known-positive outcomes used as the labelled validation set (MASTER-SPEC §5).
// Verify all figures against the cited primary sources before relying on them.
export const KNOWN_POSITIVES: InsertRiGroundTruthCase[] = [
  {
    label: "Dana-Farber Cancer Institute",
    vector: "image_manipulation",
    source: "doj_settlement",
    year: 2025,
    settlementUsd: 15_000_000,
    relatorShareUsd: 2_625_000,
    govtIntervened: true,
    referenceUrl:
      "https://www.justice.gov/opa/pr/dana-farber-cancer-institute-agrees-pay-15m-settle-fraud-allegations-related-scientific",
    notes: "6 NIH grants, 14 papers, 2014-2024; relator Sholto David 17.5%.",
  },
  {
    label: "Cleveland Clinic Foundation (PI Qing Wang)",
    vector: "foreign_funding",
    source: "doj_settlement",
    year: 2024,
    settlementUsd: 7_600_000,
    govtIntervened: true,
    referenceUrl:
      "https://www.justice.gov/usao-ndoh/pr/cleveland-clinic-pay-over-7-million-settle-allegations-undisclosed-foreign-sources",
    notes: "Undisclosed foreign support; 3 NIH grants.",
  },
  {
    label: "Van Andel Research Institute (2019)",
    vector: "foreign_funding",
    source: "doj_settlement",
    year: 2019,
    settlementUsd: 5_500_000,
    referenceUrl: "https://www.justice.gov/usao-wdmi/pr/2019_1219_VARI",
    notes: "Undisclosed Chinese grants to two researchers.",
  },
  {
    label: "Van Andel Research Institute (2021)",
    vector: "foreign_funding",
    source: "doj_settlement",
    year: 2021,
    settlementUsd: 1_100_000,
    referenceUrl: "https://oig.hhs.gov/fraud/enforcement/",
    notes: "Undisclosed foreign component/support.",
  },
  {
    label: "Stanford University",
    vector: "foreign_funding",
    source: "doj_settlement",
    year: 2023,
    settlementUsd: 1_900_000,
    referenceUrl:
      "https://www.justice.gov/archives/opa/pr/stanford-university-agrees-pay-19-million-resolve-allegations-it-failed-disclose-foreign",
    notes: "11 PIs; Fudan University tie.",
  },
  {
    label: "Duke University (Erin Potts-Kant)",
    vector: "fabricated_data",
    source: "doj_settlement",
    year: 2019,
    settlementUsd: 112_500_000,
    relatorShareUsd: 33_750_000,
    govtIntervened: false,
    referenceUrl:
      "https://www.science.org/content/article/duke-university-settles-research-misconduct-lawsuit-1125-million",
    notes: "Government declined; relator litigated alone, won 30%.",
  },
  {
    label: "Harvard T.H. Chan SPH (Spiegelman)",
    vector: "effort_reporting",
    source: "doj_settlement",
    year: 2020,
    settlementUsd: 1_359_791,
    referenceUrl:
      "https://www.justice.gov/usao-ma/pr/harvard-university-agrees-pay-over-13-million-resolve-allegations-overcharging-nih-grants",
    notes: "Effort/cost mis-reporting (weak vector; reference only).",
  },
  {
    label: "Harvard / Dr. Lee Nadler (Catalyst CTSA)",
    vector: "non_performance",
    source: "court_docket",
    year: 2026,
    govtIntervened: false,
    referenceUrl:
      "https://www.thecrimson.com/article/2026/6/28/nadler-catalyst-whistleblower-suit-ruling/",
    notes: "Ongoing; ~$93M CTSA grant, 41/56 objectives reportedly unfinished.",
  },
];

// Open, machine-ingestible sources to grow this set programmatically (connector roadmap).
export const GROUND_TRUTH_SOURCES = {
  ori: "https://ori.hhs.gov/content/case_summary",
  retractionWatch: "Crossref-hosted Retraction Watch database (downloadable)",
  dojSettlements: "https://www.justice.gov/ (press releases + settlement PDFs)",
  courtListener: "https://www.courtlistener.com/ (RECAP qui tam dockets)",
  nsfOig: "https://oig.nsf.gov/ (research misconduct case closeouts)",
  bioFors: "https://github.com/phillipecardenuto/rsiil (47,805 labelled biomedical images)",
} as const;
