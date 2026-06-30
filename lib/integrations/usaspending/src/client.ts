import {
  usaSearchResponseSchema,
  normalizeAward,
  type AwardRecord,
} from "./types";

const BASE = "https://api.usaspending.gov/api/v2";

// USASpending groups award_type_codes; you cannot mix contracts + grants in one
// request, so we query per category and merge.
export type AwardCategory = "contracts" | "grants" | "loans" | "direct_payments";

const TYPE_CODES: Record<AwardCategory, string[]> = {
  contracts: ["A", "B", "C", "D"],
  grants: ["02", "03", "04", "05"],
  loans: ["07", "08"],
  direct_payments: ["06", "10"],
};

const FIELDS = [
  "Award ID",
  "Recipient Name",
  "Award Amount",
  "Awarding Agency",
  "Start Date",
  "End Date",
  "recipient_id",
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
      if (res.status === 429 || res.status >= 500) throw new Error(`USASpending HTTP ${res.status}`);
      if (!res.ok) throw new Error(`USASpending HTTP ${res.status}`);
      return (await res.json()) as unknown;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
    }
  }
  throw lastErr;
}

export interface AwardSearchOpts {
  categories?: AwardCategory[];
  limit?: number;
}

async function searchOneCategory(
  recipientName: string,
  category: AwardCategory,
  limit: number,
): Promise<AwardRecord[]> {
  const json = await postWithRetry(`${BASE}/search/spending_by_award/`, {
    filters: {
      award_type_codes: TYPE_CODES[category],
      recipient_search_text: [recipientName],
    },
    fields: FIELDS,
    page: 1,
    limit,
    sort: "Award Amount",
    order: "desc",
  });
  const parsed = usaSearchResponseSchema.parse(json);
  return (parsed.results ?? []).map((r) => normalizeAward(r, category));
}

/** All federal awards (across categories) to a recipient name. */
export async function searchAwardsByRecipient(
  recipientName: string,
  opts: AwardSearchOpts = {},
): Promise<AwardRecord[]> {
  const categories = opts.categories ?? ["contracts", "grants"];
  const limit = opts.limit ?? 50;
  const all: AwardRecord[] = [];
  for (const category of categories) {
    try {
      const rows = await searchOneCategory(recipientName, category, limit);
      all.push(...rows);
    } catch {
      // one category failing (e.g., no results) should not abort the rest
    }
  }
  return all;
}
