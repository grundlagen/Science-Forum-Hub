// Open Contracting Data Standard (OCDS) connector — "other countries as one module."
// 50+ governments publish procurement to this single schema, so one parser ingests many
// countries (Mexico, Colombia, Ukraine, UK, Australia, Kenya, Brazil, ...). Parsing is
// pure; fetching follows OCDS release-package pagination (links.next).
//
// Normalized awards can be fed to the same detectors (dedupe, debarred) as US data.
import { z } from "zod";

const valueSchema = z
  .object({ amount: z.number().nullish(), currency: z.string().nullish() })
  .passthrough();

const partySchema = z.object({ id: z.string().nullish(), name: z.string().nullish() }).passthrough();

const awardSchema = z
  .object({
    id: z.string().nullish(),
    title: z.string().nullish(),
    date: z.string().nullish(),
    value: valueSchema.nullish(),
    suppliers: z.array(partySchema).nullish(),
  })
  .passthrough();

const releaseSchema = z
  .object({
    ocid: z.string().nullish(),
    date: z.string().nullish(),
    buyer: partySchema.nullish(),
    tender: z.object({ title: z.string().nullish() }).passthrough().nullish(),
    awards: z.array(awardSchema).nullish(),
  })
  .passthrough();

export const releasePackageSchema = z
  .object({
    releases: z.array(releaseSchema).nullish(),
    links: z.object({ next: z.string().nullish() }).passthrough().nullish(),
  })
  .passthrough();

export type OcdsReleasePackage = z.infer<typeof releasePackageSchema>;

export interface OcdsAward {
  ocid: string | null;
  awardId: string | null;
  title: string | null;
  buyer: string | null;
  supplierName: string | null;
  amount: number | null;
  currency: string | null;
  awardDate: string | null;
}

/** Flatten an OCDS release package into one row per (award, supplier). Pure. */
export function parseReleasePackage(json: unknown): OcdsAward[] {
  const pkg = releasePackageSchema.parse(json);
  const out: OcdsAward[] = [];
  for (const r of pkg.releases ?? []) {
    const buyer = r.buyer?.name ?? null;
    for (const a of r.awards ?? []) {
      const suppliers = a.suppliers ?? [];
      const rows = suppliers.length ? suppliers : [{ name: null }];
      for (const s of rows) {
        out.push({
          ocid: r.ocid ?? null,
          awardId: a.id ?? null,
          title: a.title ?? r.tender?.title ?? null,
          buyer,
          supplierName: s.name ?? null,
          amount: a.value?.amount ?? null,
          currency: a.value?.currency ?? null,
          awardDate: a.date ?? r.date ?? null,
        });
      }
    }
  }
  return out;
}

/** Shape compatible with the extrapolator's dedupe/debarred detectors (AwardLike). */
export function toAwardLike(o: OcdsAward): {
  awardId: string | null;
  recipientName: string | null;
  amount: number | null;
  startDate: string | null;
  awardingAgency: string | null;
} {
  return {
    awardId: o.awardId ?? o.ocid,
    recipientName: o.supplierName,
    amount: o.amount,
    startDate: o.awardDate,
    awardingAgency: o.buyer,
  };
}

async function getJson(url: string, retries = 3): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (res.status === 429 || res.status >= 500) throw new Error(`OCDS HTTP ${res.status}`);
      if (!res.ok) throw new Error(`OCDS HTTP ${res.status}`);
      return (await res.json()) as unknown;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
    }
  }
  throw lastErr;
}

/** Fetch an OCDS release-package endpoint, following links.next up to maxPages. */
export async function fetchAwards(startUrl: string, opts: { maxPages?: number } = {}): Promise<OcdsAward[]> {
  const maxPages = opts.maxPages ?? 3;
  let url: string | null = startUrl;
  const out: OcdsAward[] = [];
  for (let page = 0; page < maxPages && url; page++) {
    const json = await getJson(url);
    out.push(...parseReleasePackage(json));
    const pkg = releasePackageSchema.parse(json);
    url = pkg.links?.next ?? null;
  }
  return out;
}
