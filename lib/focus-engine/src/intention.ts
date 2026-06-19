/**
 * Intention quality.
 *
 * The single most reliable, cheapest intervention in this whole package is
 * forcing a concrete intention before the timer starts. "Implementation
 * intentions" — plans of the form *"I will [action] on [object] so that
 * [outcome]"* — roughly double goal attainment across hundreds of studies
 * (Gollwitzer & Sheeran 2006 meta-analysis). Specific, slightly-hard goals
 * also beat vague "do your best" goals (Locke & Latham 2002).
 *
 * So we score the intention text and, crucially, give *actionable* feedback on
 * how to make it more concrete. The score is a teaching tool, not a gate.
 */

import type { ScoreTier } from "./types";
import { scoreTier } from "./scoring";

export interface IntentionAssessment {
  score: number; // 0-100
  tier: ScoreTier;
  /** Concrete suggestions to sharpen the intention. Empty when already strong. */
  suggestions: string[];
  /** Detected signals, useful for UI affordances and tests. */
  signals: {
    hasActionVerb: boolean;
    hasConcreteObject: boolean;
    hasMeasurableTarget: boolean;
    hasOutcomeClause: boolean;
    isVague: boolean;
    wordCount: number;
  };
}

// Verbs that name a concrete deep-work action on the hub.
const ACTION_VERBS = [
  "read",
  "review",
  "write",
  "draft",
  "revise",
  "summarize",
  "summarise",
  "critique",
  "comment",
  "annotate",
  "compare",
  "synthesize",
  "synthesise",
  "outline",
  "verify",
  "check",
  "reproduce",
  "derive",
  "evaluate",
  "assess",
  "map",
  "extract",
  "analyze",
  "analyse",
  "finish",
  "complete",
];

// Vague fillers that signal an under-specified intention.
const VAGUE_TERMS = [
  "stuff",
  "things",
  "work on",
  "look at",
  "deal with",
  "some",
  "a bit",
  "whatever",
  "catch up",
  "be productive",
  "get stuff done",
];

// Words that hint at a measurable target ("section 3", "two papers", "the proof").
const MEASURABLE_HINTS = [
  "section",
  "page",
  "pages",
  "paragraph",
  "figure",
  "table",
  "proof",
  "equation",
  "abstract",
  "conclusion",
  "method",
  "results",
  "first",
  "last",
  "half",
];

// Clauses that express *why* — an outcome the work serves.
const OUTCOME_MARKERS = ["so that", "so i", "in order to", "to decide", "to understand", "because"];

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * Assess how concrete and actionable an intention is. Pure and deterministic
 * so it can run client-side for live feedback as the user types.
 */
export function assessIntention(rawText: string): IntentionAssessment {
  const text = rawText.trim().toLowerCase();
  const words = text.length === 0 ? [] : text.split(/\s+/);
  const wordCount = words.length;

  const hasActionVerb = ACTION_VERBS.some((v) => new RegExp(`\\b${v}`).test(text));
  // A concrete object: a number, a quoted/Title-cased entity in the raw text,
  // or a domain noun. We check the raw (case-sensitive) text for capitalised
  // entities like a paper title.
  const hasCapitalisedEntity = /\b[A-Z][a-z0-9]{2,}/.test(rawText.trim().replace(/^\S+/, ""));
  const hasNumber = /\d/.test(text);
  const hasDomainNoun = includesAny(text, [
    "paper",
    "review",
    "proof",
    "dataset",
    "author",
    "abstract",
    "method",
    "figure",
    "comment",
    "thread",
  ]);
  const hasConcreteObject = hasCapitalisedEntity || hasNumber || hasDomainNoun;

  const hasMeasurableTarget = hasNumber || includesAny(text, MEASURABLE_HINTS);
  const hasOutcomeClause = includesAny(text, OUTCOME_MARKERS);
  const isVague = wordCount > 0 && includesAny(text, VAGUE_TERMS);

  let score = 0;
  if (wordCount >= 3) score += 15; // enough words to mean something
  if (wordCount >= 6) score += 10; // a real phrase
  if (hasActionVerb) score += 25; // the verb is the spine of an implementation intention
  if (hasConcreteObject) score += 25; // acting *on* something specific
  if (hasMeasurableTarget) score += 15; // a finish line you can recognise
  if (hasOutcomeClause) score += 10; // the "so that" that gives the work meaning
  if (isVague) score -= 25; // explicit penalty for filler
  if (wordCount === 0) score = 0;

  score = Math.max(0, Math.min(100, score));

  const suggestions: string[] = [];
  if (wordCount === 0) {
    suggestions.push("Name what you'll do before starting — even one specific sentence doubles follow-through.");
  } else {
    if (!hasActionVerb)
      suggestions.push('Lead with a concrete verb: "review", "summarize", "verify", "revise".');
    if (!hasConcreteObject)
      suggestions.push("Point at something specific — a paper title, a section, a dataset.");
    if (!hasMeasurableTarget)
      suggestions.push('Add a finish line you can recognise ("section 3", "the two open reviews").');
    if (isVague)
      suggestions.push('Swap the vague part ("work on stuff") for the exact next action.');
    if (!hasOutcomeClause && score >= 60)
      suggestions.push('Optional: add a "so that…" to anchor why this block matters.');
  }

  return {
    score,
    tier: scoreTier(score),
    suggestions,
    signals: {
      hasActionVerb,
      hasConcreteObject,
      hasMeasurableTarget,
      hasOutcomeClause,
      isVague,
      wordCount,
    },
  };
}
