// CMS public data client (data.cms.gov data-api). Used to see whether a provider NPI
// still draws federal health-care dollars (e.g., Medicare Part D) — which, for an
// LEIE-excluded NPI, is a classic FCA signal. Dataset IDs change by release/year, so
// they are passed in by the caller (see RUNBOOK).
import { z } from "zod";

const BASE = "https://data.cms.gov/data-api/v1";

export interface ProviderPaymentRecord {
  npi: string | null;
  providerName: string | null;
  program: string;
  amountUsd: number | null;
  year: number | null;
}

const rowSchema = z.record(z.string(), z.unknown());
const responseSchema = z.array(rowSchema);

async function getJson(url: string, retries = 3): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) throw new Error(`CMS HTTP ${res.status}`);
      if (!res.ok) throw new Error(`CMS HTTP ${res.status}`);
      return (await res.json()) as unknown;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
    }
  }
  throw lastErr;
}

/** Generic datastore query: filter is a map of column -> value. */
export async function queryDataset(
  datasetId: string,
  filters: Record<string, string> = {},
  opts: { size?: number; offset?: number } = {},
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) params.set(`filter[${k}]`, v);
  params.set("size", String(opts.size ?? 100));
  params.set("offset", String(opts.offset ?? 0));
  const json = await getJson(`${BASE}/dataset/${datasetId}/data?${params.toString()}`);
  return responseSchema.parse(json);
}

function str(v: unknown): string | null {
  return v == null ? null : String(v);
}
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Medicare Part D "by provider" rows for an NPI. `datasetId` is the current release id
 * for the Medicare Part D Prescribers — by Provider dataset (see RUNBOOK), `year` is
 * recorded on the output for the temporal check.
 */
export async function getPartDByNpi(
  npi: string,
  opts: { datasetId: string; year?: number; size?: number },
): Promise<ProviderPaymentRecord[]> {
  const rows = await queryDataset(opts.datasetId, { Prscrbr_NPI: npi }, { size: opts.size ?? 50 });
  return rows.map((r) => {
    const last = str(r["Prscrbr_Last_Org_Name"]);
    const first = str(r["Prscrbr_First_Name"]);
    const providerName = last ?? (first ? `${first}` : null);
    return {
      npi: str(r["Prscrbr_NPI"]) ?? npi,
      providerName,
      program: "medicare_part_d",
      amountUsd: num(r["Tot_Drug_Cst"]),
      year: opts.year ?? null,
    };
  });
}
