import { and, desc, eq } from "drizzle-orm";
import {
  db,
  focusPreferencesTable,
  focusSessionsTable,
  DEFAULT_GUARD_RAILS,
  type FocusPreferences,
  type FocusSession,
} from "@workspace/db";

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** Grace period after a session's planned end before we reap it as expired. */
const STALE_GRACE_MINUTES = 120;

/**
 * Fetch the user's Focus Guard preferences, creating a default row on first
 * access. Defaults mirror the DB-level defaults so the API is consistent
 * whether or not a row already exists.
 */
export async function getOrCreateFocusPreferences(
  userId: string,
): Promise<FocusPreferences> {
  const [existing] = await db
    .select()
    .from(focusPreferencesTable)
    .where(eq(focusPreferencesTable.userId, userId));
  if (existing) return existing;

  const [created] = await db
    .insert(focusPreferencesTable)
    .values({ userId, guardRails: DEFAULT_GUARD_RAILS })
    .onConflictDoNothing()
    .returning();

  // A concurrent request may have created the row first; re-read in that case.
  if (created) return created;
  const [row] = await db
    .select()
    .from(focusPreferencesTable)
    .where(eq(focusPreferencesTable.userId, userId));
  return row;
}

/**
 * Serialize a session row for the API. The Drizzle row already matches the
 * response shape field-for-field; we map explicitly so new internal columns
 * never leak through the wire format by accident.
 */
export function focusSessionToPublic(s: FocusSession) {
  return {
    id: s.id,
    userId: s.userId,
    intention: s.intention,
    technique: s.technique,
    intent: s.intent,
    plannedMinutes: s.plannedMinutes,
    goalType: s.goalType,
    goalTarget: s.goalTarget,
    paperId: s.paperId,
    field: s.field,
    status: s.status,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    focusSeconds: s.focusSeconds,
    goalProgress: s.goalProgress,
    breaksTaken: s.breaksTaken,
    distractions: s.distractions,
    distractionCount: s.distractionCount,
    energyBefore: s.energyBefore,
    focusRating: s.focusRating,
    moodAfter: s.moodAfter,
    reflection: s.reflection,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/**
 * Mark long-orphaned active sessions as expired. A session is stale when the
 * wall-clock time since it started exceeds its planned duration plus a grace
 * window — i.e. the user almost certainly closed the tab without wrapping up.
 * Returns the freshly reaped ids so callers can avoid treating them as active.
 */
export async function reapStaleActiveSessions(userId: string): Promise<void> {
  const active = await db
    .select()
    .from(focusSessionsTable)
    .where(
      and(
        eq(focusSessionsTable.userId, userId),
        eq(focusSessionsTable.status, "active"),
      ),
    );
  const now = Date.now();
  for (const s of active) {
    const deadline =
      s.startedAt.getTime() +
      (s.plannedMinutes + STALE_GRACE_MINUTES) * MS_PER_MINUTE;
    if (now > deadline) {
      await db
        .update(focusSessionsTable)
        .set({ status: "expired", endedAt: new Date() })
        .where(eq(focusSessionsTable.id, s.id));
    }
  }
}

export async function getActiveFocusSession(
  userId: string,
): Promise<FocusSession | null> {
  await reapStaleActiveSessions(userId);
  const [row] = await db
    .select()
    .from(focusSessionsTable)
    .where(
      and(
        eq(focusSessionsTable.userId, userId),
        eq(focusSessionsTable.status, "active"),
      ),
    )
    .orderBy(desc(focusSessionsTable.startedAt));
  return row ?? null;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type FocusStats = {
  streakDays: number;
  bestStreakDays: number;
  todayMinutes: number;
  dailyGoalMinutes: number;
  goalMetToday: boolean;
  weekMinutes: number;
  totalSessions: number;
  completedSessions: number;
  completionRate: number;
  avgFocusRating: number | null;
  totalFocusMinutes: number;
  distractionsParked: number;
  insight: string;
  insightCitation: string;
};

/**
 * Compute aggregate focus stats for a user. Streaks count *days that contain a
 * completed session*, which reinforces competence (Self-Determination Theory)
 * without rewarding marathon cramming.
 */
export async function computeFocusStats(userId: string): Promise<FocusStats> {
  const prefs = await getOrCreateFocusPreferences(userId);
  const sessions = await db
    .select()
    .from(focusSessionsTable)
    .where(eq(focusSessionsTable.userId, userId))
    .orderBy(desc(focusSessionsTable.startedAt));

  const now = Date.now();
  const todayKey = dayKey(new Date());

  let todaySeconds = 0;
  let weekSeconds = 0;
  let totalSeconds = 0;
  let completedSessions = 0;
  let distractionsParked = 0;
  let ratingSum = 0;
  let ratingCount = 0;

  // Days (UTC) that contain at least one completed session.
  const completedDays = new Set<string>();

  for (const s of sessions) {
    totalSeconds += s.focusSeconds;
    distractionsParked += s.distractionCount;

    const startMs = s.startedAt.getTime();
    const key = dayKey(s.startedAt);
    if (key === todayKey) todaySeconds += s.focusSeconds;
    if (now - startMs < 7 * MS_PER_DAY) weekSeconds += s.focusSeconds;

    if (s.status === "completed") {
      completedSessions += 1;
      completedDays.add(key);
      if (s.focusRating != null) {
        ratingSum += s.focusRating;
        ratingCount += 1;
      }
    }
  }

  const { streakDays, bestStreakDays } = computeStreaks(completedDays, todayKey);

  const todayMinutes = Math.round(todaySeconds / 60);
  const goalMetToday = todayMinutes >= prefs.dailyGoalMinutes;
  const totalSessions = sessions.length;
  const completionRate =
    totalSessions === 0
      ? 0
      : Math.round((completedSessions / totalSessions) * 100) / 100;
  const avgFocusRating =
    ratingCount === 0 ? null : Math.round((ratingSum / ratingCount) * 10) / 10;

  const stats: Omit<FocusStats, "insight" | "insightCitation"> = {
    streakDays,
    bestStreakDays,
    todayMinutes,
    dailyGoalMinutes: prefs.dailyGoalMinutes,
    goalMetToday,
    weekMinutes: Math.round(weekSeconds / 60),
    totalSessions,
    completedSessions,
    completionRate,
    avgFocusRating,
    totalFocusMinutes: Math.round(totalSeconds / 60),
    distractionsParked,
  };

  return { ...stats, ...deriveInsight(stats) };
}

/**
 * Current streak counts consecutive days with a completed session ending today
 * or yesterday (a day of rest doesn't immediately break momentum — but two
 * does). Best streak is the longest such run ever recorded.
 */
function computeStreaks(
  completedDays: Set<string>,
  todayKey: string,
): { streakDays: number; bestStreakDays: number } {
  if (completedDays.size === 0) return { streakDays: 0, bestStreakDays: 0 };

  const toDate = (key: string) => new Date(`${key}T00:00:00.000Z`).getTime();
  const sorted = [...completedDays].sort();

  // Best streak: longest run of consecutive calendar days.
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const gap = (toDate(sorted[i]) - toDate(sorted[i - 1])) / MS_PER_DAY;
    if (gap === 1) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }

  // Current streak: walk backwards from today.
  const todayMs = toDate(todayKey);
  let current = 0;
  let cursor = todayMs;
  // Allow today to be empty (still counts if yesterday is present).
  if (!completedDays.has(dayKeyFromMs(cursor))) cursor -= MS_PER_DAY;
  while (completedDays.has(dayKeyFromMs(cursor))) {
    current += 1;
    cursor -= MS_PER_DAY;
  }

  return { streakDays: current, bestStreakDays: best };
}

function dayKeyFromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

type StatsCore = Omit<FocusStats, "insight" | "insightCitation">;

/**
 * Translate raw numbers into one supportive, psychology-grounded nudge. Order
 * matters: the first matching rule wins, so the most actionable signal surfaces.
 * Framing is deliberately autonomy-supportive (no shame, no streak-loss threats).
 */
function deriveInsight(s: StatsCore): {
  insight: string;
  insightCitation: string;
} {
  if (s.totalSessions === 0) {
    return {
      insight:
        "Start with one small, specific intention: \"When I open SciVet, I will read one paper fully before scrolling.\" Concrete if-then plans roughly double follow-through.",
      insightCitation: "Gollwitzer, Implementation Intentions (1999)",
    };
  }

  if (s.goalMetToday) {
    return {
      insight: `You've cleared your ${s.dailyGoalMinutes}-minute goal today — momentum is its own reward. Stopping while it still feels good protects tomorrow's start.`,
      insightCitation: "Zeigarnik effect (1927) / fresh-start effect (Dai et al., 2014)",
    };
  }

  if (s.streakDays >= 3) {
    return {
      insight: `${s.streakDays} days in a row with a finished session. Consistency builds the competence that makes focus feel self-chosen rather than forced.`,
      insightCitation: "Deci & Ryan, Self-Determination Theory (2000)",
    };
  }

  if (s.completedSessions >= 3 && s.completionRate < 0.6) {
    return {
      insight:
        "More than a third of your sessions end early. Try shrinking the timebox — a block you reliably finish beats an ambitious one you abandon.",
      insightCitation: "Cirillo, The Pomodoro Technique; Locke & Latham (2002)",
    };
  }

  if (s.avgFocusRating != null && s.avgFocusRating >= 4) {
    return {
      insight: `Your sessions average ${s.avgFocusRating}/5 for flow. Protect the conditions that get you there: a clear goal, no notifications, and a single paper at a time.`,
      insightCitation: "Csikszentmihalyi, Flow (1990)",
    };
  }

  if (s.distractionsParked >= 5) {
    return {
      insight: `You've parked ${s.distractionsParked} distractions instead of chasing them. Writing an intrusive thought down frees the working memory it was hogging.`,
      insightCitation: "Zeigarnik effect (1927); Masicampo & Baumeister (2011)",
    };
  }

  if (s.todayMinutes > 0) {
    const remaining = Math.max(0, s.dailyGoalMinutes - s.todayMinutes);
    return {
      insight: `${s.todayMinutes} focused minutes today — ${remaining} to reach your goal. One more short block usually gets there.`,
      insightCitation: "Locke & Latham, Goal-Setting Theory (2002)",
    };
  }

  return {
    insight:
      "A short break is not lost time — directed attention recovers when you step away. Plan the next session before you rest so restarting is frictionless.",
    insightCitation: "Kaplan, Attention Restoration Theory (1995)",
  };
}
