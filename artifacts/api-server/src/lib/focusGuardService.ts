import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  focusSessionsTable,
  focusGuardProfilesTable,
  type FocusGuardProfile,
  type FocusSession,
  type FocusIntent,
} from "@workspace/db";
import {
  assessFatigue,
  computeFocusScore,
  nextNudge,
  reviewEligibility,
  ultradianPhase,
  type FatigueAssessment,
  type FocusSignals,
  type Nudge,
  type ReviewEligibility,
} from "./focusGuard";

const ABANDON_AFTER_MS = 1000 * 60 * 30; // a session silent for 30 min is dead

function signalsOf(s: FocusSession): FocusSignals {
  return {
    intent: s.intent,
    activeMs: s.activeMs,
    idleMs: s.idleMs,
    scrollDepth: s.scrollDepth,
    distractionEvents: s.distractionEvents,
  };
}

// ---------------------------------------------------------------------------
// Guard profile
// ---------------------------------------------------------------------------

export async function getOrCreateGuardProfile(userId: string): Promise<FocusGuardProfile> {
  const [existing] = await db
    .select()
    .from(focusGuardProfilesTable)
    .where(eq(focusGuardProfilesTable.userId, userId));
  if (existing) return existing;
  const [created] = await db
    .insert(focusGuardProfilesTable)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  // Lost a race; read the row the other writer created.
  const [row] = await db
    .select()
    .from(focusGuardProfilesTable)
    .where(eq(focusGuardProfilesTable.userId, userId));
  return row;
}

const SETTING_KEYS = [
  "enforcementEnabled",
  "minReviewEngagementSec",
  "ultradianRemindersEnabled",
  "fatigueGuardEnabled",
  "dailyFocusGoalMin",
] as const;

export type GuardSettingsPatch = Partial<Pick<FocusGuardProfile, (typeof SETTING_KEYS)[number]>>;

export async function updateGuardSettings(
  userId: string,
  patch: GuardSettingsPatch,
): Promise<FocusGuardProfile> {
  await getOrCreateGuardProfile(userId);
  const set: GuardSettingsPatch = {};
  for (const k of SETTING_KEYS) {
    if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
  }
  if (Object.keys(set).length === 0) return getOrCreateGuardProfile(userId);
  const [row] = await db
    .update(focusGuardProfilesTable)
    .set(set)
    .where(eq(focusGuardProfilesTable.userId, userId))
    .returning();
  return row;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function startSession(
  userId: string,
  paperId: number | null,
  intent: FocusIntent,
): Promise<FocusSession> {
  await getOrCreateGuardProfile(userId);
  const [row] = await db
    .insert(focusSessionsTable)
    .values({ userId, paperId, intent, state: "active" })
    .returning();
  return row;
}

export interface HeartbeatPatch {
  activeMs?: number;
  idleMs?: number;
  scrollDepth?: number;
  distractionEvents?: number;
  breaksTaken?: number;
}

/**
 * Apply a heartbeat. Monotonic fields (activeMs, idleMs, scrollDepth,
 * distractionEvents, breaksTaken) only ever move forward: we take the max of
 * the stored and incoming values so duplicate or out-of-order beats can't
 * corrupt the tally.
 */
export async function heartbeat(
  sessionId: number,
  userId: string,
  patch: HeartbeatPatch,
): Promise<FocusSession | null> {
  const [existing] = await db
    .select()
    .from(focusSessionsTable)
    .where(and(eq(focusSessionsTable.id, sessionId), eq(focusSessionsTable.userId, userId)));
  if (!existing || existing.state !== "active") return existing ?? null;

  const [row] = await db
    .update(focusSessionsTable)
    .set({
      activeMs: Math.max(existing.activeMs, Math.floor(patch.activeMs ?? 0)),
      idleMs: Math.max(existing.idleMs, Math.floor(patch.idleMs ?? 0)),
      scrollDepth: Math.max(existing.scrollDepth, patch.scrollDepth ?? 0),
      distractionEvents: Math.max(
        existing.distractionEvents,
        Math.floor(patch.distractionEvents ?? 0),
      ),
      breaksTaken: Math.max(existing.breaksTaken, Math.floor(patch.breaksTaken ?? 0)),
      lastHeartbeatAt: new Date(),
    })
    .where(eq(focusSessionsTable.id, sessionId))
    .returning();
  return row;
}

export async function endSession(
  sessionId: number,
  userId: string,
  state: "completed" | "abandoned" = "completed",
): Promise<{ session: FocusSession; breakdown: ReturnType<typeof computeFocusScore> } | null> {
  const [existing] = await db
    .select()
    .from(focusSessionsTable)
    .where(and(eq(focusSessionsTable.id, sessionId), eq(focusSessionsTable.userId, userId)));
  if (!existing) return null;

  const breakdown = computeFocusScore(signalsOf(existing));
  const phase = ultradianPhase(existing.activeMs);

  const [session] = await db
    .update(focusSessionsTable)
    .set({
      state,
      endedAt: new Date(),
      focusScore: breakdown.score,
      ultradianPhase: phase,
    })
    .where(eq(focusSessionsTable.id, sessionId))
    .returning();

  if (existing.state === "active") {
    await rollUpProfile(userId, existing.activeMs, existing.breaksTaken);
  }
  return { session, breakdown };
}

/** Fold a finished session's contribution into the user's rolling aggregates. */
async function rollUpProfile(userId: string, activeMs: number, breaksTaken: number): Promise<void> {
  const profile = await getOrCreateGuardProfile(userId);
  const addSec = Math.floor(activeMs / 1000);

  const today = new Date().toISOString().slice(0, 10);
  const totalToday = profile.totalFocusedSec + addSec; // approximation for goal feedback
  let { currentStreakDays, longestStreakDays, lastGoalDate } = profile;
  const goalSec = profile.dailyFocusGoalMin * 60;
  if (lastGoalDate !== today && totalToday >= goalSec) {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    currentStreakDays = lastGoalDate === yesterday ? currentStreakDays + 1 : 1;
    longestStreakDays = Math.max(longestStreakDays, currentStreakDays);
    lastGoalDate = today;
  }

  await db
    .update(focusGuardProfilesTable)
    .set({
      totalFocusedSec: profile.totalFocusedSec + addSec,
      sessionCount: profile.sessionCount + 1,
      reviewsSinceBreak: breaksTaken > 0 ? 0 : profile.reviewsSinceBreak,
      lastBreakAt: breaksTaken > 0 ? new Date() : profile.lastBreakAt,
      lastSessionAt: new Date(),
      currentStreakDays,
      longestStreakDays,
      lastGoalDate,
    })
    .where(eq(focusGuardProfilesTable.userId, userId));
}

/** Mark that the user took a deliberate restorative break (resets fatigue). */
export async function recordBreak(userId: string): Promise<FocusGuardProfile> {
  await getOrCreateGuardProfile(userId);
  const [row] = await db
    .update(focusGuardProfilesTable)
    .set({ reviewsSinceBreak: 0, lastBreakAt: new Date() })
    .where(eq(focusGuardProfilesTable.userId, userId))
    .returning();
  return row;
}

/** Note that a review was cast — advances the decision-fatigue counter. */
export async function noteReviewCast(userId: string): Promise<void> {
  await getOrCreateGuardProfile(userId);
  await db
    .update(focusGuardProfilesTable)
    .set({ reviewsSinceBreak: sql`${focusGuardProfilesTable.reviewsSinceBreak} + 1` })
    .where(eq(focusGuardProfilesTable.userId, userId));
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

/**
 * The session that best represents a user's engagement with a paper: the one
 * with the most active time among recent, non-abandoned sessions. This is what
 * "did they really read it?" should be measured against.
 */
export async function bestSessionForPaper(
  userId: string,
  paperId: number,
): Promise<FocusSession | null> {
  const rows = await db
    .select()
    .from(focusSessionsTable)
    .where(
      and(eq(focusSessionsTable.userId, userId), eq(focusSessionsTable.paperId, paperId)),
    )
    .orderBy(desc(focusSessionsTable.activeMs))
    .limit(1);
  const top = rows[0];
  if (!top) return null;
  if (top.state === "abandoned") return null;
  return top;
}

export async function getFatigue(userId: string): Promise<FatigueAssessment> {
  const profile = await getOrCreateGuardProfile(userId);
  return assessFatigue({
    reviewsSinceBreak: profile.reviewsSinceBreak,
    lastBreakAt: profile.lastBreakAt,
  });
}

export interface GuardState {
  fatigue: FatigueAssessment;
  eligibility: ReviewEligibility;
  nudge: Nudge | null;
  focusScore: number | null;
  session: FocusSession | null;
  profile: FocusGuardProfile;
}

/** Full guard picture for "should/can this user review this paper right now?". */
export async function getGuardState(userId: string, paperId: number): Promise<GuardState> {
  const profile = await getOrCreateGuardProfile(userId);
  const fatigue = assessFatigue({
    reviewsSinceBreak: profile.reviewsSinceBreak,
    lastBreakAt: profile.lastBreakAt,
  });
  const session = await bestSessionForPaper(userId, paperId);
  const signals = session ? signalsOf(session) : null;

  const eligibility = reviewEligibility({
    session: signals,
    fatigue,
    minReviewEngagementSec: profile.minReviewEngagementSec,
    enforcementEnabled: profile.enforcementEnabled,
  });

  const nudge = signals
    ? nextNudge({
        signals,
        fatigue,
        ultradianRemindersEnabled: profile.ultradianRemindersEnabled,
        fatigueGuardEnabled: profile.fatigueGuardEnabled,
      })
    : null;

  const focusScore = session ? computeFocusScore(signalsOf(session)).score : null;

  return { fatigue, eligibility, nudge, focusScore, session, profile };
}

export { ABANDON_AFTER_MS };
