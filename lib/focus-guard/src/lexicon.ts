/**
 * Lexicon — the deterministic, dependency-free substrate the engine reasons
 * over. No model calls here: just normalisation, tokenisation, and curated
 * marker sets. Keeping this layer pure makes the whole engine testable and
 * reproducible, and gives an LLM-augmentation path something concrete to
 * override (see guard.ts → EvidenceOverrides).
 */

/** Words too common to carry topical signal; excluded from overlap scoring. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "for",
  "with",
  "about",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "they",
  "them",
  "their",
  "we",
  "our",
  "you",
  "your",
  "i",
  "me",
  "my",
  "he",
  "she",
  "his",
  "her",
  "from",
  "into",
  "over",
  "under",
  "than",
  "so",
  "such",
  "not",
  "no",
  "do",
  "does",
  "did",
  "has",
  "have",
  "had",
  "can",
  "could",
  "would",
  "should",
  "will",
  "shall",
  "may",
  "might",
  "must",
  "there",
  "here",
  "what",
  "which",
  "who",
  "whom",
  "how",
  "when",
  "where",
  "why",
  "all",
  "any",
  "some",
  "more",
  "most",
  "other",
  "very",
  "just",
  "also",
  "too",
  "only",
  "own",
  "same",
]);

/**
 * Markers of genuine epistemic work — reasoning connectives, data references,
 * and quantitative claims. Their presence raises a contribution's engagement
 * score (Toulmin's argument model: warrants and grounds, not just claims).
 */
export const EVIDENCE_MARKERS: readonly RegExp[] = [
  /\bbecause\b/i,
  /\btherefore\b/i,
  /\bhence\b/i,
  /\bthus\b/i,
  /\bsince\b/i,
  /\bgiven that\b/i,
  /\bas a result\b/i,
  /\bfor example\b/i,
  /\bfor instance\b/i,
  /\be\.g\.\b/i,
  /\bin (?:section|figure|table|fig\.?|eq\.?|appendix)\b/i,
  /\bp\s*[<=>]\s*0?\.\d+/i, // p-values
  /\b\d+(?:\.\d+)?\s*%/, // percentages
  /\[\d+\]/, // numeric citations
  /\bdoi:\s*\S+/i,
  /\bn\s*=\s*\d+/i, // sample sizes
];

/**
 * Hedging markers. Well-calibrated scientific critique is tentative
 * (epistemic humility); a total absence of hedging alongside strong claims is
 * itself a weak signal of overconfidence. Used to *modulate*, not penalise.
 */
export const HEDGING_MARKERS: readonly RegExp[] = [
  /\bmay\b/i,
  /\bmight\b/i,
  /\bcould\b/i,
  /\bperhaps\b/i,
  /\bpossibly\b/i,
  /\bseems?\b/i,
  /\bappears?\b/i,
  /\bsuggests?\b/i,
  /\bI think\b/i,
  /\bit is possible\b/i,
  /\btentatively\b/i,
];

/** Lowercase, collapse whitespace, strip most punctuation to spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s%<=>.\[\]-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Content tokens: alphanumeric, length >= 3, not a stopword. */
export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Light stemmer: trims common English suffixes so "method"≈"methods". */
export function stem(token: string): string {
  return token
    .replace(/(ies)$/, "y")
    .replace(/(ses|sses)$/, "s")
    .replace(/(ization|isation)$/, "ize")
    .replace(/(ological|ologies|ology)$/, "olog")
    .replace(/(ing|edly|edness|ness|ment|ions|ion|ers|er|ed|es|s)$/, "")
    .replace(/(.)\1$/, "$1"); // de-double trailing consonant
}

/** Tokenize then stem, preserving order. */
export function stemTokens(text: string): string[] {
  return tokenize(text).map(stem);
}

/** Count how many of the given patterns match anywhere in the text. */
export function countMatches(
  text: string,
  patterns: readonly RegExp[],
): number {
  let n = 0;
  for (const p of patterns) {
    if (p.test(text)) n += 1;
  }
  return n;
}

/** Collect the literal substrings matched by the given patterns (deduped). */
export function collectMatches(
  text: string,
  patterns: readonly RegExp[],
): string[] {
  const found = new Set<string>();
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[0]) found.add(m[0].trim().toLowerCase());
  }
  return [...found];
}

/** Sentence count, used to normalise affect/intensity signals by length. */
export function sentenceCount(text: string): number {
  const parts = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  return Math.max(1, parts.length);
}

/** Fraction of letters that are uppercase (shouting heuristic). */
export function uppercaseRatio(text: string): number {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length === 0) return 0;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length;
}
