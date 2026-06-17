/**
 * Residue Guard — attention residue between papers.
 *
 * Switching to a new paper before the previous one is cognitively closed leaves
 * residue that degrades attention on the new task (Leroy 2009). A brief,
 * enforced cooldown after closing a paper turns an abrupt switch into a
 * deliberate one and gives the previous judgment time to settle.
 */
import { RESIDUE_COOLDOWN_MS } from "../constants";
import type { FocusSession, ResidueAssessment } from "../types";

export function assessResidue(
  session: FocusSession,
  now: number,
  enabled: boolean,
): ResidueAssessment {
  if (!enabled || session.lastPaperClosedAt === null) {
    return { clean: true, cooldownRemainingMs: 0 };
  }
  const elapsed = now - session.lastPaperClosedAt;
  const remaining = Math.max(0, RESIDUE_COOLDOWN_MS - elapsed);
  return { clean: remaining === 0, cooldownRemainingMs: remaining };
}
