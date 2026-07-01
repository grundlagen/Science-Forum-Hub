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

function withAuth(rawUrl: string): string {
  const u = new URL(rawUrl);
  const m = process.env.OPENALEX_MAILTO ?? "";
  if (m && !u.searchParams.has("mailto")) u.searchParams.set("mailto", m);
  const key = process.env.OPENALEX_API_KEY ?? "";
  if (key && !u.searchParams.has("api_key")) u.searchParams.set("api_key", key);
  return u.toString();
}

async function getJson(rawUrl: string, retries = 3): Promise<unknown> {
  const url = withAuth(rawUrl);
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

export interface WorksFilterOpts extends WorksOpts {
  sort?: string;
}

// Generic filtered works search. `filter` is a raw OpenAlex filter string
// (e.g. "funders.id:F4320332161,institutions.country_code:CN"). Used by the
// real-world discovery scan to seed candidate authors.
export async function searchWorks(
  filter: string,
  opts: WorksFilterOpts = {},
): Promise<OpenAlexWorksResponse> {
  const params = new URLSearchParams();
  params.set("filter", filter);
  params.set("per_page", String(opts.perPage ?? 50));
  params.set("page", String(opts.page ?? 1));
  if (opts.sort) params.set("sort", opts.sort);
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
