// SAM.gov exclusions (debarment) loader. The public Exclusions Extract is a downloadable
// CSV (no API key needed). This module parses it and indexes by UEI / normalized name.
// All-pure: no network, so it runs anywhere.

export interface ExclusionRecord {
  name: string;
  uei: string | null;
  classification: string | null; // Individual / Firm / etc.
  exclusionType: string | null;
  activationDate: string | null;
  terminationDate: string | null; // "Indefinite" or a date
}

// Minimal RFC4180-ish CSV parser (handles quoted fields + embedded commas/quotes).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function pick(header: string[], row: string[], ...candidates: string[]): string | null {
  for (const cand of candidates) {
    const idx = header.findIndex((h) => h.trim().toLowerCase() === cand.toLowerCase());
    if (idx >= 0 && row[idx] != null && row[idx].trim() !== "") return row[idx].trim();
  }
  return null;
}

/** Parse a SAM.gov Exclusions Extract CSV into records (tolerant of column variants). */
export function parseExclusionsCsv(text: string): ExclusionRecord[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0];
  const out: ExclusionRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name =
      pick(header, r, "Name", "Exclusion Name") ??
      [pick(header, r, "First"), pick(header, r, "Middle"), pick(header, r, "Last")]
        .filter(Boolean)
        .join(" ");
    if (!name) continue;
    out.push({
      name,
      uei: pick(header, r, "Unique Entity ID", "UEI", "SAM Number"),
      classification: pick(header, r, "Classification"),
      exclusionType: pick(header, r, "Exclusion Type", "Exclusion Program"),
      activationDate: pick(header, r, "Active Date", "Activation Date", "Creation_Date"),
      terminationDate: pick(header, r, "Termination Date", "Termination_Date"),
    });
  }
  return out;
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(inc|llc|corp|corporation|company|co|ltd|the)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface ExclusionIndex {
  byUei: Map<string, ExclusionRecord[]>;
  byName: Map<string, ExclusionRecord[]>;
}

export function buildExclusionIndex(records: ExclusionRecord[]): ExclusionIndex {
  const byUei = new Map<string, ExclusionRecord[]>();
  const byName = new Map<string, ExclusionRecord[]>();
  for (const rec of records) {
    if (rec.uei) {
      const k = rec.uei.trim().toUpperCase();
      (byUei.get(k) ?? byUei.set(k, []).get(k)!).push(rec);
    }
    const nk = normalizeName(rec.name);
    if (nk) (byName.get(nk) ?? byName.set(nk, []).get(nk)!).push(rec);
  }
  return { byUei, byName };
}
