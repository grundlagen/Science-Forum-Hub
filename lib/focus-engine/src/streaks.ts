/**
 * Streaks and daily load — habit support without dark patterns.
 *
 * Consistency builds habits more than intensity does; an automatic behaviour
 * forms over weeks of repetition, and a single missed day does *not* reset the
 * underlying habit (Lally et al. 2010). So our streak logic is forgiving by
 * design — it grants one "grace" gap so a single off day never erases weeks of
 * effort — and we deliberately avoid manufacturing loss-aversion panic.
 *
 * We also cap encouragement: past a daily ceiling we stop cheering and start
 * nudging *rest*, because recovery (psychological detachment from work) is what
 * actually sustains performance and prevents burnout (Sonnentag 2003).
 */

export interface DaySummary {
  /** Calendar day in YYYY-MM-DD (the user's local day). */
  date: string;
  focusedMinutes: number;
}

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
  /** True if the streak will break unless the user focuses today. */
  atRisk: boolean;
  /** Whether the one-day grace has been spent within the current streak. */
  graceUsed: boolean;
}

/** A day "counts" toward a streak at this many focused minutes. */
export const STREAK_QUALIFYING_MINUTES = 20;

function toDate(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function dayDiff(a: string, b: string): number {
  return Math.round((toDate(a) - toDate(b)) / 86_400_000);
}

/**
 * Compute streaks from a set of day summaries. `today` is the user's local
 * calendar day (YYYY-MM-DD) so "at risk" is meaningful across time zones.
 */
export function computeStreaks(summaries: DaySummary[], today: string): StreakResult {
  const qualifying = summaries
    .filter((s) => s.focusedMinutes >= STREAK_QUALIFYING_MINUTES)
    .map((s) => s.date)
    .sort(); // ascending
  const unique = [...new Set(qualifying)];

  if (unique.length === 0) {
    return { currentStreak: 0, longestStreak: 0, atRisk: false, graceUsed: false };
  }

  // Longest run allowing a single one-day gap to be bridged once per run.
  let longest = 0;
  let run = 0;
  let graceInRun = false;
  for (let i = 0; i < unique.length; i++) {
    if (i === 0) {
      run = 1;
      graceInRun = false;
    } else {
      const gap = dayDiff(unique[i], unique[i - 1]);
      if (gap === 1) {
        run += 1;
      } else if (gap === 2 && !graceInRun) {
        run += 1; // bridge a single missing day, once
        graceInRun = true;
      } else {
        run = 1;
        graceInRun = false;
      }
    }
    if (run > longest) longest = run;
  }

  // Current streak: walk backwards from the most recent qualifying day, but
  // only if that day is today or yesterday (otherwise the streak is over).
  const last = unique[unique.length - 1];
  const sinceLast = dayDiff(today, last);
  let current = 0;
  let graceUsed = false;
  let atRisk = false;

  if (sinceLast <= 1) {
    current = 1;
    for (let i = unique.length - 1; i > 0; i--) {
      const gap = dayDiff(unique[i], unique[i - 1]);
      if (gap === 1) {
        current += 1;
      } else if (gap === 2 && !graceUsed) {
        current += 1;
        graceUsed = true;
      } else {
        break;
      }
    }
    // If the last qualifying day was yesterday, today is the day to keep it.
    atRisk = sinceLast === 1;
  } else if (sinceLast === 2) {
    // Missed exactly one day: the one-day grace can still save the streak,
    // but only if it focuses today — so it's at risk and grace is now spent.
    current = 1;
    for (let i = unique.length - 1; i > 0; i--) {
      const gap = dayDiff(unique[i], unique[i - 1]);
      if (gap === 1) current += 1;
      else break;
    }
    atRisk = true;
    graceUsed = true;
  }

  return { currentStreak: current, longestStreak: Math.max(longest, current), atRisk, graceUsed };
}

export interface DailyLoadAdvice {
  /** Recommended ceiling for sustainable focused work in a day. */
  recommendedCeilingMinutes: number;
  overCeiling: boolean;
  message: string;
}

/**
 * Guidance on the day's accumulated load. The default ceiling reflects that
 * only a handful of hours of genuinely deep work per day is sustainable for
 * most people — more is usually shallow time wearing a deep-work badge.
 */
export function adviseDailyLoad(focusedMinutesToday: number, ceilingMinutes = 240): DailyLoadAdvice {
  const overCeiling = focusedMinutesToday >= ceilingMinutes;
  let message: string;
  if (overCeiling) {
    message =
      "You've done a full day of deep work. More hours now buy shallow time and tomorrow's fatigue — protect your recovery and stop.";
  } else if (focusedMinutesToday >= ceilingMinutes * 0.75) {
    message = "Strong day. One more block at most, then let it consolidate overnight.";
  } else if (focusedMinutesToday === 0) {
    message = "Nothing logged yet today. One small, concrete block is enough to keep the habit alive.";
  } else {
    message = "Good momentum — there's room for more focused work today.";
  }
  return { recommendedCeilingMinutes: ceilingMinutes, overCeiling, message };
}
