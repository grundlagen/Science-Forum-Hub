// Pipeline C (shared) — the certification chain.
//
// Turns a detector signal on a work into the FCA *theory*: the compromised work was
// produced under specific NIH grant(s), so the institution's certifications (PI
// oversight, allowable-expense use, full disclosure) were false, and the government
// "paid funds it otherwise would not have." This is the legally decisive, least-built
// layer — it converts a raw signal into a case package.
//
// Output is probable cause for counsel/FOCUS, never a finding of fraud.
import type { SignalKind } from "@workspace/db/schema";

export type FalseCertification = "pi_oversight" | "allowable_expenses" | "full_disclosure";

export interface GrantRef {
  coreProjectNum: string;
  piName?: string | null;
  institution?: string | null;
  startYear?: number | null;
  endYear?: number | null;
}

export interface WorkRef {
  ref: string; // OpenAlex id / DOI / PMID
  title?: string | null;
  correspondingAuthor?: string | null;
  /** Whether the senior/corresponding author is also a grant PI (undermines oversight cert). */
  seniorAuthorIsPi?: boolean;
}

export interface CertificationChain {
  work: WorkRef;
  grants: GrantRef[];
  signalKind: SignalKind;
  linked: boolean;
  impliedFalseCertifications: FalseCertification[];
  oversightUndermined: boolean;
  counterfactual: string;
  confidence: number; // 0..100
  narrative: string;
}

export interface CertificationInput {
  work: WorkRef;
  grants: GrantRef[];
  signalKind: SignalKind;
  signalScore: number; // 0..100 from the detector
}

export function buildCertificationChain(input: CertificationInput): CertificationChain {
  const { work, grants, signalKind, signalScore } = input;
  const linked = grants.length > 0;
  const oversightUndermined = linked && work.seniorAuthorIsPi === true;

  const certs = new Set<FalseCertification>();
  if (linked) {
    // Funds were spent producing compromised output.
    certs.add("allowable_expenses");
    // Compromised data/images under the PI's stated oversight.
    if (signalKind === "image_duplication" || signalKind === "data_anomaly" || oversightUndermined) {
      certs.add("pi_oversight");
    }
    // Undisclosed foreign support implicates the disclosure certification.
    if (signalKind === "foreign_funding_mismatch") {
      certs.add("full_disclosure");
    }
  }

  // Linkage strength: 1 grant => 0.5, >=2 corroborating grants => 1.0.
  const linkageStrength = Math.min(1, grants.length / 2);
  const confidence = linked
    ? Math.round(Math.min(100, signalScore * (0.5 + 0.5 * linkageStrength)))
    : 0;

  const grantList = grants.map((g) => g.coreProjectNum).join(", ");
  const counterfactual = linked
    ? `But for the compromised research, NIH would not have paid funds under grant(s) ${grantList}.`
    : "No grant linkage established; the FCA certification theory is not supported.";

  const narrative = linked
    ? `Work ${work.ref} was produced under NIH grant(s) ${grantList}` +
      `${work.correspondingAuthor ? `, corresponding author ${work.correspondingAuthor}` : ""}. ` +
      `A ${signalKind} signal (score ${signalScore}) implicates the institution's ` +
      `certification(s): ${[...certs].join(", ")}. ` +
      `${oversightUndermined ? "The senior/corresponding author is a grant PI, undermining the oversight certification. " : ""}` +
      `Disclosure status is unverifiable from the public record; this is probable cause for review, not proof of fraud.`
    : `Work ${work.ref} has no established NIH grant linkage; no FCA certification theory.`;

  return {
    work,
    grants,
    signalKind,
    linked,
    impliedFalseCertifications: [...certs],
    oversightUndermined,
    counterfactual,
    confidence,
    narrative,
  };
}
