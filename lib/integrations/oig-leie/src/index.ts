// HHS-OIG LEIE (List of Excluded Individuals/Entities) loader. The full database is a
// public monthly CSV download (no API key). Excluded parties may not receive payment
// from any federal health care program — billing while excluded is a classic FCA signal.
// All-pure: no network, runs anywhere.

export interface ExcludedProvider {
  name: string; // BUSNAME, else "FIRST LAST"
  npi: string | null; // null when LEIE has no NPI ("0000000000")
  exclType: string | null;
  exclDateIso: string | null; // normalized from EXCLDATE (YYYYMMDD)
  reinDateIso: string | null;
  state: string | null;
}

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

function col(header: string[], row: string[], name: string): string | null {
  const idx = header.findIndex((h) => h.trim().toUpperCase() === name.toUpperCase());
  if (idx < 0) return null;
  const v = row[idx]?.trim();
  return v ? v : null;
}

function yyyymmddToIso(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function cleanNpi(v: string | null): string | null {
  if (!v) return null;
  const n = v.replace(/\D/g, "");
  return n && !/^0+$/.test(n) ? n : null;
}

/** Parse the LEIE CSV (tolerant of column-name variants). */
export function parseLeieCsv(text: string): ExcludedProvider[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0];
  const out: ExcludedProvider[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const bus = col(header, r, "BUSNAME");
    const first = col(header, r, "FIRSTNAME");
    const last = col(header, r, "LASTNAME");
    const name = bus ?? [first, last].filter(Boolean).join(" ");
    if (!name) continue;
    out.push({
      name,
      npi: cleanNpi(col(header, r, "NPI")),
      exclType: col(header, r, "EXCLTYPE"),
      exclDateIso: yyyymmddToIso(col(header, r, "EXCLDATE")),
      reinDateIso: yyyymmddToIso(col(header, r, "REINDATE")),
      state: col(header, r, "STATE"),
    });
  }
  return out;
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(inc|llc|corp|corporation|company|co|ltd|md|do|the)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface LeieIndex {
  byNpi: Map<string, ExcludedProvider[]>;
  byName: Map<string, ExcludedProvider[]>;
}

export function buildLeieIndex(records: ExcludedProvider[]): LeieIndex {
  const byNpi = new Map<string, ExcludedProvider[]>();
  const byName = new Map<string, ExcludedProvider[]>();
  for (const rec of records) {
    if (rec.npi) (byNpi.get(rec.npi) ?? byNpi.set(rec.npi, []).get(rec.npi)!).push(rec);
    const nk = normalizeName(rec.name);
    if (nk) (byName.get(nk) ?? byName.set(nk, []).get(nk)!).push(rec);
  }
  return { byNpi, byName };
}
