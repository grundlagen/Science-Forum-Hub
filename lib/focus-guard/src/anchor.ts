import type { ClaimType, FocusAnchor } from "./types";
import { stem, STOPWORDS, tokenize } from "./lexicon";

/** The slice of a paper Focus Guard needs to derive an anchor. */
export interface PaperLike {
  title: string;
  abstract: string;
  body?: string;
  fields?: string[];
}

const CLAIM_TYPE_MARKERS: Array<{ type: ClaimType; markers: RegExp[] }> = [
  {
    type: "empirical",
    markers: [
      /\bwe (?:measured|observed|found|tested|ran|conducted)\b/i,
      /\bexperiment(?:s|al)?\b/i,
      /\bdata(?:set)?\b/i,
      /\bparticipants?\b/i,
      /\bp\s*[<=>]\s*0?\.\d+/i,
    ],
  },
  {
    type: "methodological",
    markers: [
      /\bwe (?:introduce|present|propose) (?:a |an |the )?(?:new )?(?:method|algorithm|approach|technique|framework|protocol)\b/i,
      /\bbenchmark\b/i,
      /\bpipeline\b/i,
    ],
  },
  {
    type: "theoretical",
    markers: [
      /\bwe (?:prove|derive|propose|argue|conjecture)\b/i,
      /\btheorem\b/i,
      /\bmodel\b/i,
      /\bframework\b/i,
    ],
  },
  {
    type: "review",
    markers: [
      /\bwe (?:survey|review)\b/i,
      /\bsystematic review\b/i,
      /\bmeta[- ]analysis\b/i,
      /\bliterature\b/i,
    ],
  },
];

function inferClaimType(text: string): ClaimType {
  for (const { type, markers } of CLAIM_TYPE_MARKERS) {
    if (markers.some((m) => m.test(text))) return type;
  }
  return "other";
}

/** Split into rough sentences, trimmed and non-empty. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Pick the sentence most likely to *be* the central claim. Heuristic: prefer
 * a sentence with a claim cue ("we show/find/propose/argue"); otherwise fall
 * back to the first substantive sentence of the abstract, else the title.
 */
function pickCentralClaim(title: string, abstract: string): string {
  const claimCue =
    /\bwe (?:show|find|propose|argue|demonstrate|prove|introduce|present|report)\b/i;
  for (const s of sentences(abstract)) {
    if (claimCue.test(s)) return s;
  }
  const first = sentences(abstract)[0];
  if (first && first.length >= 20) return first;
  return title.trim();
}

/**
 * Rank content terms by frequency across title + abstract (title weighted
 * higher), returning the top `limit` distinct stems with a representative
 * surface form.
 */
function extractKeyTerms(
  title: string,
  abstract: string,
  fields: string[],
  limit: number,
): string[] {
  const weight = new Map<string, number>();
  const surface = new Map<string, string>();

  const add = (text: string, w: number) => {
    for (const tok of tokenize(text)) {
      const s = stem(tok);
      if (s.length < 3) continue;
      weight.set(s, (weight.get(s) ?? 0) + w);
      if (!surface.has(s)) surface.set(s, tok);
    }
  };

  add(title, 3);
  add(abstract, 1);
  // Fields are curated metadata: strong topical signal, always retained.
  const fieldTerms = fields
    .map((f) => f.trim().toLowerCase())
    .filter((f) => f.length > 0 && !STOPWORDS.has(f));

  const ranked = [...weight.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([s]) => surface.get(s) ?? s);

  // Dedupe while preserving order: fields first, then frequency-ranked terms.
  const out: string[] = [];
  const seen = new Set<string>();
  for (const term of [...fieldTerms, ...ranked]) {
    const key = stem(term);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out.slice(0, limit);
}

export interface DeriveAnchorOptions {
  /** Max key terms to retain. Default 12. */
  maxKeyTerms?: number;
  /** Topics to explicitly mark out of scope. */
  outScope?: string[];
}

/**
 * Derive a {@link FocusAnchor} from a paper using deterministic heuristics.
 *
 * This is the zero-dependency baseline; a future routine can replace the body
 * of this function with an LLM-extracted anchor while keeping the same shape,
 * and everything downstream continues to work unchanged.
 */
export function deriveAnchor(
  paper: PaperLike,
  options: DeriveAnchorOptions = {},
): FocusAnchor {
  const { maxKeyTerms = 12, outScope = [] } = options;
  const fields = paper.fields ?? [];
  const claimText = `${paper.title} ${paper.abstract}`;

  return {
    centralClaim: pickCentralClaim(paper.title, paper.abstract),
    keyTerms: extractKeyTerms(paper.title, paper.abstract, fields, maxKeyTerms),
    inScope: fields.slice(),
    outScope: outScope.slice(),
    claimType: inferClaimType(claimText),
  };
}
