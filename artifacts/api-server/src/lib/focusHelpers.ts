import type { FocusSession, FocusDistraction } from "@workspace/db";

/**
 * Serialize a DB focus-session row into the API shape. The Drizzle row already
 * matches field-for-field, but we go through an explicit map so the contract is
 * visible at the boundary and accidental column leaks can't happen.
 */
export function serializeSession(s: FocusSession) {
  return {
    id: s.id,
    userId: s.userId,
    paperId: s.paperId,
    activity: s.activity,
    intention: s.intention,
    cadence: s.cadence,
    plannedMinutes: s.plannedMinutes,
    breakMinutes: s.breakMinutes,
    guards: s.guards,
    status: s.status,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    focusedSeconds: s.focusedSeconds,
    flowScore: s.flowScore,
    energyBefore: s.energyBefore,
    energyAfter: s.energyAfter,
    reflection: s.reflection,
    distractionCount: s.distractionCount,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export function serializeDistraction(d: FocusDistraction) {
  return {
    id: d.id,
    sessionId: d.sessionId,
    kind: d.kind,
    note: d.note,
    breached: d.breached,
    resolved: d.resolved,
    createdAt: d.createdAt,
  };
}

/** UTC YYYY-MM-DD bucket for a timestamp. v1 uses UTC; per-user tz is a future refinement. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Count consecutive days (ending today or yesterday) on which the user logged
 * any focused work. We tolerate a one-day gap at the *front* only — i.e. a
 * streak stays "alive" through today even before today's first session — but a
 * missed full day breaks it. Gentle by design: no partial-credit shaming.
 */
function currentStreak(daysWithFocus: Set<string>): number {
  if (daysWithFocus.size === 0) return 0;
  const today = new Date();
  // Allow the streak to be anchored at today or yesterday, so a user mid-morning
  // who hasn't started yet doesn't see their streak "already broken".
  let cursor = new Date(today);
  if (!daysWithFocus.has(dayKey(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!daysWithFocus.has(dayKey(cursor))) return 0;
  }
  let streak = 0;
  while (daysWithFocus.has(dayKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function longestStreak(daysWithFocus: Set<string>): number {
  if (daysWithFocus.size === 0) return 0;
  const sorted = [...daysWithFocus].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() + 1);
    if (dayKey(prev) === sorted[i]) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

export interface FocusStats {
  focusedMinutesToday: number;
  dailyGoalMinutes: number;
  goalMetToday: boolean;
  currentStreakDays: number;
  longestStreakDays: number;
  sessionsCompleted: number;
  totalFocusedMinutes: number;
  averageFlowScore: number | null;
  breachRate: number;
  activeSessionId: number | null;
}

/**
 * Derive a user's focus dashboard from their raw sessions + distractions.
 * Computed in app code (not SQL) deliberately: per-user volume is tiny and the
 * streak/ART logic is far clearer here than in window functions.
 */
export function computeStats(
  sessions: FocusSession[],
  distractions: FocusDistraction[],
  dailyGoalMinutes: number,
): FocusStats {
  const todayKey = dayKey(new Date());
  const daysWithFocus = new Set<string>();
  let focusedSecondsToday = 0;
  let totalFocusedSeconds = 0;
  let sessionsCompleted = 0;
  let flowSum = 0;
  let flowCount = 0;
  let activeSessionId: number | null = null;

  for (const s of sessions) {
    totalFocusedSeconds += s.focusedSeconds;
    if (s.status === "completed") sessionsCompleted += 1;
    if (s.status === "active" || s.status === "paused") activeSessionId ??= s.id;
    if (s.flowScore != null) {
      flowSum += s.flowScore;
      flowCount += 1;
    }
    // A day "counts" toward streaks if it carried real focused time.
    const anchor = s.startedAt ?? s.createdAt;
    if (s.focusedSeconds > 0) {
      const key = dayKey(anchor);
      daysWithFocus.add(key);
      if (key === todayKey) focusedSecondsToday += s.focusedSeconds;
    }
  }

  const breached = distractions.filter((d) => d.breached).length;
  const breachRate = distractions.length === 0 ? 0 : breached / distractions.length;

  const focusedMinutesToday = Math.round(focusedSecondsToday / 60);

  return {
    focusedMinutesToday,
    dailyGoalMinutes,
    goalMetToday: focusedMinutesToday >= dailyGoalMinutes,
    currentStreakDays: currentStreak(daysWithFocus),
    longestStreakDays: longestStreak(daysWithFocus),
    sessionsCompleted,
    totalFocusedMinutes: Math.round(totalFocusedSeconds / 60),
    averageFlowScore: flowCount === 0 ? null : Math.round((flowSum / flowCount) * 10) / 10,
    breachRate: Math.round(breachRate * 100) / 100,
    activeSessionId,
  };
}
