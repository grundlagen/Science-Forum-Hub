import type { FigureSourceType } from "@workspace/db";

export type { FigureSourceType };

/** A figure pulled from a source, before decode/hash/storage. */
export type RawFigure = {
  bytes: Uint8Array;
  caption: string | null;
  panelLabel: string | null;
  /** DOI / PMCID / URL identifying the source document. */
  sourceRef: string | null;
  sourceType: FigureSourceType;
};

/**
 * Injectable byte fetcher. Adapters take this rather than calling the network
 * directly, so ingestion parsing is unit-testable offline and the caller owns
 * rate-limiting, the proxy, and terms-of-service compliance.
 */
export type Fetcher = (url: string) => Promise<Uint8Array>;

/** A source that can resolve a reference (PMCID/DOI/URL) into raw figures. */
export interface FigureSource {
  readonly kind: FigureSourceType;
  fetchFigures(ref: string, fetch: Fetcher): Promise<RawFigure[]>;
}

/** Default fetcher over global fetch. Respects the environment's outbound proxy. */
export const httpFetcher: Fetcher = async (url: string): Promise<Uint8Array> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
};
