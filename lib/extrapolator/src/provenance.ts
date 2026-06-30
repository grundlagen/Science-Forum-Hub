import { createHash } from "node:crypto";

/** Stable content hash for provenance / snapshot integrity. */
export function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export interface ProvenanceInput {
  source: string;
  sourceUrl?: string;
  raw: unknown;
  publicAsOf?: string;
}

export interface ProvenanceRecord {
  source: string;
  sourceUrl: string | null;
  contentSha256: string;
  publicAsOf: string | null;
}

/** Build a provenance record from a raw payload (hashes a canonical JSON form). */
export function buildProvenance(p: ProvenanceInput): ProvenanceRecord {
  return {
    source: p.source,
    sourceUrl: p.sourceUrl ?? null,
    contentSha256: sha256(JSON.stringify(p.raw)),
    publicAsOf: p.publicAsOf ?? null,
  };
}
