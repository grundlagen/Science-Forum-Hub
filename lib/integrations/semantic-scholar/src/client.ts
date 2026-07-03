import {
  s2SearchResponseSchema,
  s2PaperSchema,
  s2DatasetReleaseSchema,
  s2DatasetFilesSchema,
  type S2Paper,
  type S2SearchResponse,
} from "./types";

const GRAPH = "https://api.semanticscholar.org/graph/v1";
const DATASETS = "https://api.semanticscholar.org/datasets/v1";

// SEMANTIC_SCHOLAR_API_KEY unlocks 1 req/s -> 100 req/s + the bulk Datasets endpoints.
// Key request: https://www.semanticscholar.org/product/api
function headers(): Record<string, string> {
  const key = process.env.SEMANTIC_SCHOLAR_API_KEY ?? "";
  return key ? { "x-api-key": key } : {};
}

async function getJson(url: string, retries = 3): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: headers() });
      if (res.status === 429) throw new Error("S2 429 rate-limited");
      if (!res.ok) throw new Error(`S2 ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

// --- graph API (per-paper lookups) -----------------------------------------

const DEFAULT_FIELDS = [
  "title",
  "abstract",
  "year",
  "externalIds",
  "authors.name",
  "authors.authorId",
  "embedding.specter_v2",
].join(",");

export async function getPaperByDoi(doi: string, fields = DEFAULT_FIELDS): Promise<S2Paper> {
  const url = `${GRAPH}/paper/DOI:${encodeURIComponent(doi)}?fields=${encodeURIComponent(fields)}`;
  return s2PaperSchema.parse(await getJson(url));
}

export async function getPaperByPmid(pmid: string, fields = DEFAULT_FIELDS): Promise<S2Paper> {
  const url = `${GRAPH}/paper/PMID:${encodeURIComponent(pmid)}?fields=${encodeURIComponent(fields)}`;
  return s2PaperSchema.parse(await getJson(url));
}

export async function searchPapers(
  query: string,
  { limit = 20, fields = DEFAULT_FIELDS }: { limit?: number; fields?: string } = {},
): Promise<S2SearchResponse> {
  const url = `${GRAPH}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${encodeURIComponent(fields)}`;
  return s2SearchResponseSchema.parse(await getJson(url));
}

// --- bulk datasets (SPECTER2 embeddings, abstracts, s2orc, ...) -----------
//
// The dataset shard files are pre-signed and expire ~1 hour. Fetch, stream to disk
// (Google Drive mount or local NVMe), then read locally. `latestRelease()` gives the
// release id to pin against.

export async function latestRelease(): Promise<string> {
  const raw = (await getJson(`${DATASETS}/release/latest`)) as { release_id: string };
  return raw.release_id;
}

export async function listDatasets(release: string) {
  return s2DatasetReleaseSchema.parse(await getJson(`${DATASETS}/release/${release}`));
}

export async function datasetFiles(release: string, dataset: string) {
  return s2DatasetFilesSchema.parse(
    await getJson(`${DATASETS}/release/${release}/dataset/${dataset}`),
  );
}

// Convenience: enumerate the shard URLs for a dataset name. Caller streams each
// URL to disk (see scripts/ri-embed-download.sh — TODO).
export async function shardUrls(release: string, dataset: string): Promise<string[]> {
  const meta = await datasetFiles(release, dataset);
  return meta.files;
}
