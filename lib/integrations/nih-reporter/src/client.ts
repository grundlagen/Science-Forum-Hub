import { projectsResponseSchema, type ProjectsResponse } from "./types";

const BASE = "https://api.reporter.nih.gov/v2";

const INCLUDE_FIELDS = [
  "ApplId",
  "ProjectNum",
  "CoreProjectNum",
  "FiscalYear",
  "ProjectTitle",
  "AwardAmount",
  "ProjectStartDate",
  "ProjectEndDate",
  "PrincipalInvestigators",
  "Organization",
];

async function postWithRetry(url: string, body: unknown, retries = 3): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`NIH RePORTER HTTP ${res.status}`);
      }
      if (!res.ok) {
        throw new Error(`NIH RePORTER HTTP ${res.status}`);
      }
      return (await res.json()) as unknown;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
    }
  }
  throw lastErr;
}

export interface SearchOpts {
  limit?: number;
  offset?: number;
  fiscalYears?: number[];
}

export async function searchProjectsByOrg(
  orgName: string,
  opts: SearchOpts = {},
): Promise<ProjectsResponse> {
  const json = await postWithRetry(`${BASE}/projects/search`, {
    criteria: {
      org_names: [orgName],
      ...(opts.fiscalYears ? { fiscal_years: opts.fiscalYears } : {}),
    },
    include_fields: INCLUDE_FIELDS,
    offset: opts.offset ?? 0,
    limit: opts.limit ?? 50,
  });
  return projectsResponseSchema.parse(json);
}

export async function searchProjectsByPi(
  piName: string,
  opts: SearchOpts = {},
): Promise<ProjectsResponse> {
  const json = await postWithRetry(`${BASE}/projects/search`, {
    criteria: {
      pi_names: [{ any_name: piName }],
      ...(opts.fiscalYears ? { fiscal_years: opts.fiscalYears } : {}),
    },
    include_fields: INCLUDE_FIELDS,
    offset: opts.offset ?? 0,
    limit: opts.limit ?? 50,
  });
  return projectsResponseSchema.parse(json);
}
