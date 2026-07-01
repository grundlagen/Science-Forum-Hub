// PI identity resolution (M1 disambiguation).
//
// The blocker Pipeline B hit: a name like "Qing Wang" matches ~50 different
// people across NIH RePORTER and OpenAlex, so naive `authors[0]` glues strangers
// together and the detector scores coincidence as fraud (spec §6 match_confidence,
// §12 identity false-positives).
//
// The clean, authoritative anchor is NIH's own grant->publication link
// (RePORTER publications / ExPORTER PROJECT<->PMID): the *real* PI is the OpenAlex
// author who wrote the papers NIH says those grants produced. These helpers are
// pure so they can be unit-tested offline; network fetching lives in dossier.ts.

export type MatchMethod = "grant-linked-pmid" | "institution" | "name-only" | "unresolved";

export interface CandidateSignal {
  authorId: string | null;
  orcid: string | null;
  displayName: string | null;
  // How many of this candidate's works carry a PMID that NIH links to the PI's grants.
  matchedPmidCount: number;
  // Does the candidate's own affiliation match the NIH award organisation(s)?
  instMatch: boolean;
  // OpenAlex search rank (0 = most relevant name match); used only as a last tiebreak.
  rank: number;
}

export interface PiResolution {
  authorId: string | null;
  orcid: string | null;
  displayName: string | null;
  matchConfidence: number; // 0..1
  method: MatchMethod;
  matchedPmidCount: number;
}

// OpenAlex encodes PMIDs as full URLs ("https://pubmed.ncbi.nlm.nih.gov/12345678");
// RePORTER returns bare numbers. Normalise both to the digit string.
export function normPmid(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  const m = /(\d{4,9})/.exec(String(raw));
  return m ? m[1] : null;
}

const ORG_STOPWORDS = new Set([
  "the", "of", "and", "for", "at", "university", "college", "school", "institute",
  "institution", "center", "centre", "hospital", "clinic", "foundation", "department",
  "medical", "medicine", "health", "research", "inc", "llc", "system", "systems",
]);

export function tokenizeOrg(name: string | null | undefined): Set<string> {
  if (!name) return new Set();
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !ORG_STOPWORDS.has(t)),
  );
}

// Distinctive-token overlap between a candidate's institutions and the NIH orgs.
// Requires a shared non-generic token (e.g. "cleveland", "stanford"), so
// "University of X" vs "University of Y" does not spuriously match.
export function orgMatch(
  candidateInstNames: string[],
  nihOrgNames: string[],
): boolean {
  const nih = new Set<string>();
  for (const n of nihOrgNames) for (const t of tokenizeOrg(n)) nih.add(t);
  if (nih.size === 0) return false;
  for (const c of candidateInstNames) {
    for (const t of tokenizeOrg(c)) if (nih.has(t)) return true;
  }
  return false;
}

// Turn a candidate's signals into a confidence + method. Grant-linked PMIDs are
// authoritative (NIH itself asserts the grant produced the paper); institution
// match is corroborating; name-only is the ambiguous danger zone the gate suppresses.
export function scoreCandidate(c: CandidateSignal): PiResolution {
  let method: MatchMethod;
  let confidence: number;
  if (c.matchedPmidCount >= 1) {
    method = "grant-linked-pmid";
    confidence = Math.min(1, 0.7 + 0.1 * Math.min(c.matchedPmidCount, 3));
    if (c.instMatch) confidence = Math.min(1, confidence + 0.05);
  } else if (c.instMatch) {
    method = "institution";
    confidence = 0.5;
  } else {
    method = "name-only";
    confidence = 0.2;
  }
  return {
    authorId: c.authorId,
    orcid: c.orcid,
    displayName: c.displayName,
    matchConfidence: confidence,
    method,
    matchedPmidCount: c.matchedPmidCount,
  };
}

// Rank candidates: authoritative PMID overlap first, then institution match,
// then OpenAlex relevance. Returns the best resolution (or unresolved if none).
export function pickBestCandidate(cands: CandidateSignal[]): PiResolution {
  if (cands.length === 0) {
    return {
      authorId: null,
      orcid: null,
      displayName: null,
      matchConfidence: 0,
      method: "unresolved",
      matchedPmidCount: 0,
    };
  }
  const sorted = [...cands].sort((a, b) => {
    if (b.matchedPmidCount !== a.matchedPmidCount) return b.matchedPmidCount - a.matchedPmidCount;
    if (a.instMatch !== b.instMatch) return a.instMatch ? -1 : 1;
    return a.rank - b.rank;
  });
  return scoreCandidate(sorted[0]);
}
