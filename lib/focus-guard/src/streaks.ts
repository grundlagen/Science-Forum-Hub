/**
 * streaks.ts — habit strength without the cliff.
 *
 * Two findings shape this:
 *  - Automaticity grows asymptotically; in Lally et al. (2010) the median time
 *    to plateau was ~66 days, and crucially a single missed day did NOT reset
 *    progress. @see CITATIONS.HABIT_FORMATION
 *  - The "what-the-hell effect": after one lapse people tend to abandon the
 *    goal entirely. We counter it with grace tokens — a miss spends a token
 *    instead of breaking the streak — and with explicitly recoverable framing.
 *    @see CITATIONS.WHAT_THE_HELL
 */

import { HABIT } from "./constants";
import { clamp01, round } from "./math";
import type { StreakAssessment } from "./types";

/**
 * @param history Days, oldest-first, true if a focus session happened that day.
 *                The last element is the most recent day.
 * @param graceTokens How many missed days to forgive before the streak breaks.
 */
export function assessStreak(
  history: readonly boolean[],
  graceTokens: number = HABIT.GRACE_TOKENS,
): StreakAssessment {
  const totalDays = history.reduce((n, d) => (d ? n + 1 : n), 0);

  // Walk backwards from today, spending grace on misses.
  let current = 0;
  let grace = graceTokens;
  let graceUsed = false;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]) {
      current++;
      continue;
    }
    if (grace > 0) {
      grace--;
      graceUsed = true;
      continue; // forgiven gap, keep counting
    }
    break; // streak truly ends here
  }

  // Longest run, also grace-tolerant (a single forgiven gap doesn't split it).
  let longest = 0;
  let run = 0;
  let localGrace = graceTokens;
  for (const day of history) {
    if (day) {
      run++;
      longest = Math.max(longest, run);
    } else if (localGrace > 0) {
      localGrace--; // bridge the gap
    } else {
      run = 0;
      localGrace = graceTokens;
    }
  }

  const automaticity = clamp01(1 - Math.exp(-totalDays / HABIT.AUTOMATICITY_DAYS));

  let message: string;
  const lastDay = history[history.length - 1];
  if (lastDay === false && graceUsed) {
    message =
      "Missed yesterday — no problem, that's one grace day spent, not a reset. One miss never undoes the habit; just show up today.";
  } else if (current === 0) {
    message = "Fresh start. The first few days are the hardest; the curve gets easier fast.";
  } else if (automaticity >= 0.6) {
    message = `${current}-day streak and this is becoming automatic (${Math.round(automaticity * 100)}%). You're past the hardest part.`;
  } else {
    message = `${current}-day streak. Automaticity is building (${Math.round(automaticity * 100)}%) — consistency matters more than intensity right now.`;
  }

  return {
    current,
    longest,
    automaticity: round(automaticity),
    graceRemaining: grace,
    message,
  };
}
