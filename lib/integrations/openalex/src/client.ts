import {
  openalexWorksResponseSchema,
  openalexAuthorsResponseSchema,
  openalexFunderSchema,
  type OpenAlexWorksResponse,
  type OpenAlexAuthorsResponse,
  type OpenAlexFunder,
} from "./types";

const BASE = "https://api.openalex.org";

// OpenAlex "polite pool": set OPENALEX_MAILTO to a contact email for better rate limits.
function mailto(): string {
  return process.env.OPENALEX_MAILTO ?? "";
}

async function getJson(url: string, retries = 3): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`OpenAlex HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw new Error(`OpenAlex HTTP ${res.status}`);
      }
      return (await res.json()) as unknown;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
    }
  }
  throw lastErr;
}

export interface WorksOpts {
  perPage?: number;
  page?: number;
  fromYear?: number;
}

export async function getWorksByInstitutionRor(
  ror: string,
  opts: WorksOpts = {},
): Promise<OpenAlexWorksResponse> {
  const filters = [`institutions.ror:${ror}`];
  if (opts.fromYear) filters.push(`from_publication_date:${opts.fromYear}-01-01`);
  const params = new URLSearchParams();
  params.set("filter", filters.join(","));
  params.set("per_page", String(opts.perPage ?? 50));
  params.set("page", String(opts.page ?? 1));
  const m = mailto();
  if (m) params.set("mailto", m);
  const json = await getJson(`${BASE}/works?${params.toString()}`);
  return openalexWorksResponseSchema.parse(json);
}

export async function getWorksByAuthorId(
  openalexAuthorId: string,
  opts: WorksOpts = {},
): Promise<OpenAlexWorksResponse> {
  const id = openalexAuthorId.replace(/^https?:\/\/openalex\.org\//, "");
  const params = new URLSearchParams();
  params.set("filter", `author.id:${id}`);
  params.set("per_page", String(opts.perPage ?? 50));
  params.set("page", String(opts.page ?? 1));
  const m = mailto();
  if (m) params.set("mailto", m);
  const json = await getJson(`${BASE}/works?${params.toString()}`);
  return openalexWorksResponseSchema.parse(json);
}

export interface AuthorSearchOpts {
  perPage?: number;
}

export async function searchAuthors(
  name: string,
  opts: AuthorSearchOpts = {},
): Promise<OpenAlexAuthorsResponse> {
  const params = new URLSearchParams();
  params.set("search", name);
  params.set("per_page", String(opts.perPage ?? 5));
  const m = mailto();
  if (m) params.set("mailto", m);
  const json = await getJson(`${BASE}/authors?${params.toString()}`);
  return openalexAuthorsResponseSchema.parse(json);
}

export async function getFunder(funderId: string): Promise<OpenAlexFunder> {
  const id = funderId.replace(/^https?:\/\/openalex\.org\//, "");
  const json = await getJson(`${BASE}/funders/${id}`);
  return openalexFunderSchema.parse(json);
}
