/**
 * intentions.ts — implementation intentions ("if-then plans").
 *
 * Gollwitzer's implementation intentions ("if situation X arises, then I will
 * do Y") reliably outperform vague goal intentions because they pre-decide the
 * response and bind it to a concrete cue, automating initiation. We validate,
 * score, and format them. @see CITATIONS.IMPLEMENTATION_INTENTIONS
 */

import { clamp01, round } from "./math";
import type { ImplementationIntention, IntentionCueType } from "./types";

/** A small starter set of action verbs used to nudge well-formed actions. */
const ACTION_VERBS = [
  "write",
  "read",
  "review",
  "draft",
  "analyse",
  "analyze",
  "derive",
  "prove",
  "run",
  "code",
  "outline",
  "revise",
  "check",
  "open",
  "start",
  "finish",
  "summarise",
  "summarize",
  "replicate",
  "cite",
];

const CUE_LABEL: Record<IntentionCueType, string> = {
  time: "at",
  location: "at",
  event: "after",
  completion: "when",
};

function startsWithVerb(action: string): boolean {
  const first = action.trim().toLowerCase().split(/\s+/)[0] ?? "";
  // accept listed verbs or a generic "to <verb>" / "-ing" heuristic
  return ACTION_VERBS.includes(first) || /(ed|ing|e)$/.test(first) === false;
}

export interface IntentionValidation {
  readonly wellFormed: boolean;
  /** 0..1 specificity/strength estimate. */
  readonly strength: number;
  readonly issues: readonly string[];
}

export function validateIntention(
  intention: ImplementationIntention,
): IntentionValidation {
  const issues: string[] = [];
  const cue = intention.cue?.trim() ?? "";
  const action = intention.action?.trim() ?? "";

  if (cue.length < 2) issues.push("The cue is missing or too vague to trigger reliably.");
  if (action.length < 3) issues.push("The action is missing or too short to be concrete.");
  if (action.length >= 3 && !startsWithVerb(action)) {
    issues.push("Start the action with a verb so it reads as a decision, not a wish.");
  }

  // Strength: concreteness of the cue (length + a digit/time signal) plus a
  // concrete, appropriately-scoped action. Completion/event cues bind tightest.
  let strength = 0;
  strength += clamp01(cue.length / 24) * 0.35;
  strength += /\d/.test(cue) || intention.cueType === "completion" ? 0.2 : 0.05;
  strength += clamp01(action.length / 40) * 0.3;
  strength += startsWithVerb(action) ? 0.15 : 0;

  return {
    wellFormed: issues.length === 0,
    strength: round(clamp01(strength)),
    issues,
  };
}

/** Render an intention as a canonical "If ..., then I will ..." sentence. */
export function formatIntention(intention: ImplementationIntention): string {
  const connector = CUE_LABEL[intention.cueType];
  const cue = intention.cue.trim();
  const action = intention.action.trim();
  return `If it's ${connector} ${cue}, then I will ${action}.`;
}
