// Operational disambiguation set for the foreign-funding validation cases.
// KNOWN_POSITIVES (groundTruth.ts) records the legal outcome; this adds the fields
// the live pipeline actually needs to resolve and run each case: the PI's name as it
// appears on the grant, the org to disambiguate against, and the foreign country/entity
// the settlement actually cited. Facts verified against DOJ/OIG primary sources
// (2026-07-01 research pass); grant core numbers are intentionally null where no public
// release named one — we do NOT fabricate them.
export interface ForeignFundingCase {
  // Stable key matching the KNOWN_POSITIVES label prefix.
  label: string;
  // PI name as it should be searched in NIH RePORTER / OpenAlex.
  pi: string;
  // Org hint for --org disambiguation (as it appears in NIH RePORTER org_name).
  org: string;
  // Country the settlement actually cited (ISO-2, uppercase). This is what the
  // detector's surfaced foreign countries are graded against.
  expectedCountry: string;
  // Foreign program/entity named in the settlement (context; not machine-matched).
  foreignEntity: string;
  // Specific NIH core project numbers if a public release named them; else null.
  knownGrants: string[] | null;
  // True NIH FCA/grant case (runnable). False = non-NIH funder (e.g. DoD/NASA) — kept
  // for completeness but excluded from NIH-pipeline scoring.
  nihCase: boolean;
  referenceUrl: string;
  notes: string;
}

export const FOREIGN_FUNDING_CASES: ForeignFundingCase[] = [
  {
    label: "Cleveland Clinic Foundation (PI Qing Wang)",
    pi: "Qing Wang",
    org: "Cleveland Clinic",
    expectedCountry: "CN",
    foreignEntity: "Thousand Talents Program; Huazhong University of Science and Technology; NSFC",
    knownGrants: null,
    nihCase: true,
    referenceUrl:
      "https://oig.hhs.gov/fraud/enforcement/cleveland-clinic-to-pay-over-7-million-to-settle-allegations-of-undisclosed-foreign-sources-of-funding-on-nih-grant-applications-and-reports/",
    notes: "$7.6M FCA settlement 2024-05-17; ~$3.6M NIH funding cited. The Pipeline B ground-truth positive.",
  },
  {
    label: "Van Andel Research Institute (2019) — Xu",
    pi: "Eric Xu",
    org: "Van Andel Research Institute",
    expectedCountry: "CN",
    foreignEntity: "Thousand Talents Program; Shanghai Institute of Materia Medica",
    knownGrants: null,
    nihCase: true,
    referenceUrl: "https://www.justice.gov/usao-wdmi/pr/2019_1219_VARI",
    notes: "$5.5M settlement 2019-12 (joint with Ma). Also known as Eric Xu.",
  },
  {
    label: "Van Andel Research Institute (2019) — Ma",
    pi: "Jiyan Ma",
    org: "Van Andel Research Institute",
    expectedCountry: "CN",
    foreignEntity: "Thousand Talents Program",
    knownGrants: null,
    nihCase: true,
    referenceUrl: "https://www.justice.gov/usao-wdmi/pr/2019_1219_VARI",
    notes: "$5.5M settlement 2019-12 (joint with Xu).",
  },
  {
    label: "Van Andel Research Institute (2021)",
    pi: "Eric Xu",
    org: "Van Andel Research Institute",
    expectedCountry: "CN",
    foreignEntity: "Thousand Talents Program (undisclosed foreign component)",
    knownGrants: null,
    nihCase: true,
    referenceUrl:
      "https://www.justice.gov/usao-wdmi/pr/2021_0901_Van_Andel_Research_Institute_Settlement",
    notes: "$1.1M settlement 2021-09; same PI as the 2019 case.",
  },
  {
    label: "Ohio State University (Song Guo Zheng)",
    pi: "Song Guo Zheng",
    org: "Ohio State University",
    expectedCountry: "CN",
    foreignEntity: "Thousand Talents Plan",
    knownGrants: null,
    nihCase: true,
    referenceUrl:
      "https://www.justice.gov/usao-sdoh/pr/university-researcher-sentenced-prison-lying-grant-applications-develop-scientific",
    notes: "Criminal: 37mo prison + ~$3.4M NIH restitution, 2021-05. Prior appt at Penn State.",
  },
  {
    label: "Emory University (Xiao-Jiang Li)",
    pi: "Xiao-Jiang Li",
    org: "Emory University",
    expectedCountry: "CN",
    foreignEntity: "Chinese Academy of Sciences; Thousand Talents (reported)",
    knownGrants: null,
    nihCase: true,
    referenceUrl: "https://www.science.org/content/article/ex-emory-scientist-ties-china-charged-fraud",
    notes: "Criminal plea 2020-05 (false tax return); ~$92k salary from 3 NIH grants in 2015.",
  },
  {
    label: "Stanford University (Richard Zare)",
    pi: "Richard Zare",
    org: "Stanford University",
    expectedCountry: "CN",
    foreignEntity: "Fudan University; NSFC",
    knownGrants: null,
    nihCase: false,
    referenceUrl:
      "https://www.justice.gov/usao-md/pr/stanford-university-agrees-pay-19-million-resolve-allegations-it-failed-disclose-foreign",
    notes: "$1.9M settlement 2023-10 but funders were Army/Navy/AF/NASA/NSF — NOT NIH. Excluded from NIH scoring.",
  },
];
