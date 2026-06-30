import { z } from "zod";

// spending_by_award returns records keyed by human-readable column labels.
export const usaAwardRawSchema = z.record(z.string(), z.unknown());

export const usaSearchResponseSchema = z
  .object({
    results: z.array(usaAwardRawSchema).nullish(),
    page_metadata: z
      .object({ page: z.number().nullish(), hasNext: z.boolean().nullish() })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export type UsaAwardRaw = z.infer<typeof usaAwardRawSchema>;
export type UsaSearchResponse = z.infer<typeof usaSearchResponseSchema>;

// Clean, normalized award record used downstream.
export interface AwardRecord {
  awardId: string | null;
  recipientName: string | null;
  recipientId: string | null;
  amount: number | null;
  awardingAgency: string | null;
  startDate: string | null;
  endDate: string | null;
  category: string | null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function normalizeAward(raw: UsaAwardRaw, category: string | null = null): AwardRecord {
  return {
    awardId: str(raw["Award ID"]),
    recipientName: str(raw["Recipient Name"]),
    recipientId: str(raw["recipient_id"]),
    amount: num(raw["Award Amount"]),
    awardingAgency: str(raw["Awarding Agency"]),
    startDate: str(raw["Start Date"]),
    endDate: str(raw["End Date"]),
    category,
  };
}
