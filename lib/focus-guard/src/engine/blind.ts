/**
 * Blind-First Guard — anti-anchoring / anti-herding.
 *
 * The single biggest threat to honest peer review is contamination: a reviewer
 * who sees the AI verdict, the running vote tally, or other reviewers' stances
 * *before* forming their own judgment is anchored on them (Tversky & Kahneman
 * 1974) and tends to conform (Asch 1956; herding in review scores). Focus Guard
 * withholds every social and machine signal until the reviewer commits an
 * independent stance, then reveals everything so genuine discussion can follow.
 */
import { ALL_SIGNALS } from "../types";
import type { BlindAssessment, PaperEngagement } from "../types";

export function assessBlind(
  engagement: PaperEngagement | null,
  enabled: boolean,
): BlindAssessment {
  if (!enabled) {
    return {
      revealed: [...ALL_SIGNALS],
      hidden: [],
      reason: "Blind-First Guard is disabled; all signals shown.",
    };
  }
  if (engagement?.stanceCommitted) {
    return {
      revealed: [...ALL_SIGNALS],
      hidden: [],
      reason: "Independent stance committed — signals revealed for discussion.",
    };
  }
  return {
    revealed: [],
    hidden: [...ALL_SIGNALS],
    reason:
      "Forming an independent judgment. AI verdict, scores, votes and peer reviews are hidden to prevent anchoring.",
  };
}
