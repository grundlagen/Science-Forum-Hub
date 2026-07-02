// SBA PPP loan-level data loader. The SBA publishes the full FOIA loan-level dataset
// (every PPP loan, borrower name/address, amounts, jobs reported, lender) as public
// CSVs at data.sba.gov. Per DOJ, PPP data-mining is the single most active source of
// data-miner qui tam filings. This module parses the CSV and indexes by normalized
// borrower name and address. All-pure: no network, so it runs anywhere.
//
// Download (run on your own machine):
//   https://data.sba.gov/dataset/ppp-foia  (public_150k_plus_*.csv + up_to_150k_*.csv)

export interface PppLoanRecord {
  loanNumber: string | null;
  borrowerName: string;
  borrowerAddress: string | null;
  borrowerCity: string | null;
  borrowerState: string | null;
  borrowerZip: string | null;
  dateApproved: string | null;
  initialApprovalAmount: number | null;
  currentApprovalAmount: number | null;
  forgivenessAmount: number | null;
  jobsReported: number | null;
  naicsCode: string | null;
  businessType: string | null;
  lender: string | null;
  processingMethod: string | null; // PPP = first draw, PPS = second draw
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

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Parse an SBA PPP FOIA CSV into records (tolerant of column-name variants). */
export function parsePppCsv(text: string): PppLoanRecord[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0];
  const out: PppLoanRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = pick(header, r, "BorrowerName", "Borrower Name");
    if (!name) continue;
    out.push({
      loanNumber: pick(header, r, "LoanNumber", "Loan Number"),
      borrowerName: name,
      borrowerAddress: pick(header, r, "BorrowerAddress", "Borrower Address"),
      borrowerCity: pick(header, r, "BorrowerCity", "Borrower City"),
      borrowerState: pick(header, r, "BorrowerState", "Borrower State"),
      borrowerZip: pick(header, r, "BorrowerZip", "Borrower Zip"),
      dateApproved: pick(header, r, "DateApproved", "Date Approved"),
      initialApprovalAmount: num(pick(header, r, "InitialApprovalAmount", "Initial Approval Amount")),
      currentApprovalAmount: num(pick(header, r, "CurrentApprovalAmount", "Current Approval Amount")),
      forgivenessAmount: num(pick(header, r, "ForgivenessAmount", "Forgiveness Amount")),
      jobsReported: num(pick(header, r, "JobsReported", "Jobs Reported")),
      naicsCode: pick(header, r, "NAICSCode", "NAICS Code"),
      businessType: pick(header, r, "BusinessType", "Business Type"),
      lender: pick(header, r, "ServicingLenderName", "Lender", "OriginatingLender"),
      processingMethod: pick(header, r, "ProcessingMethod", "Processing Method"),
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

export function normalizeAddress(rec: PppLoanRecord): string {
  return [rec.borrowerAddress, rec.borrowerCity, rec.borrowerState, rec.borrowerZip]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface PppIndex {
  byName: Map<string, PppLoanRecord[]>;
  byAddress: Map<string, PppLoanRecord[]>;
}

export function buildPppIndex(records: PppLoanRecord[]): PppIndex {
  const byName = new Map<string, PppLoanRecord[]>();
  const byAddress = new Map<string, PppLoanRecord[]>();
  for (const rec of records) {
    const nk = normalizeName(rec.borrowerName);
    if (nk) (byName.get(nk) ?? byName.set(nk, []).get(nk)!).push(rec);
    const ak = normalizeAddress(rec);
    if (ak) (byAddress.get(ak) ?? byAddress.set(ak, []).get(ak)!).push(rec);
  }
  return { byName, byAddress };
}
