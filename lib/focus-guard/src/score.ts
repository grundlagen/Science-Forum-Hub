/**
 * score.ts — score a finished session the way it will actually be remembered.
 *
 * The peak-end rule (Kahneman): the remembered quality of an experience is
 * dominated by its most intense moment and its ending, with surprising neglect
 * of total duration. So we weight peak and end heavily and the average lightly.
 * We then nudge by objective signals (completion, how much the guard shielded,
 * residue carried in) to keep the score honest rather than purely felt.
 * @see CITATIONS.PEAK_END
 */

import { PEAK_END } from "./constants";
import { clamp, clamp01, round } from "./math";
import type { SessionScore, SessionScoreInput } from "./types";

function gradeFor(score: number): SessionScore["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

export function scoreSession(input: SessionScoreInput): SessionScore {
  const peak = clamp(input.peakIntensity, 0, 10);
  const end = clamp(input.endSatisfaction, 0, 10);
  const meanI = clamp(input.meanIntensity ?? (peak + end) / 2, 0, 10);

  // Remembered (peak-end weighted) vs experienced (the honest average).
  const remembered10 =
    PEAK_END.PEAK_WEIGHT * peak +
    PEAK_END.END_WEIGHT * end +
    PEAK_END.MEAN_WEIGHT * meanI;
  const experienced10 = meanI;

  let score = remembered10 * 10; // → 0..100

  const highlights: string[] = [];

  // Completion: finishing what you planned protects the streak and the ending.
  const completion = clamp01(input.completion);
  score *= clamp(0.7 + 0.3 * completion, 0.7, 1);
  if (completion >= 0.95) highlights.push("You finished the full block — the strongest possible ending.");
  else if (completion < 0.5) highlights.push("Block ended early; consider a smaller, finishable box next time.");

  // Shielding ratio: rewards a well-defended session.
  const totalInterruptions = input.interruptionsHonored + input.interruptionsShielded;
  if (totalInterruptions > 0) {
    const shieldRatio = input.interruptionsShielded / totalInterruptions;
    score *= clamp(0.9 + 0.1 * shieldRatio, 0.9, 1);
    if (shieldRatio >= 0.8) highlights.push(`Guarded well — shielded ${input.interruptionsShielded} of ${totalInterruptions} interruptions.`);
  }

  // Residue carried in dampens the achievable ceiling a little.
  if (typeof input.residueAtStart === "number" && input.residueAtStart > 0.4) {
    score *= 0.95;
    highlights.push("You started with heavy attention residue — a clearing ritual would lift the ceiling next time.");
  }

  if (peak >= 8) highlights.push("Hit a genuine peak of deep focus — that moment is what you'll remember.");

  const finalScore = round(clamp(score, 0, 100), 0);
  return {
    score: finalScore,
    experiencedScore: round(experienced10 * 10, 0),
    grade: gradeFor(finalScore),
    highlights,
  };
}
