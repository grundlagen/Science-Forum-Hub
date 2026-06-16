import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  focusProfilesTable,
  focusSessionsTable,
  focusEventsTable,
  type FocusSession,
} from "@workspace/db";
import {
  UpdateFocusProfileBody,
  GetFocusRecommendationQueryParams,
  ListFocusSessionsQueryParams,
  StartFocusSessionBody,
  GetFocusSessionParams,
  HeartbeatFocusSessionParams,
  HeartbeatFocusSessionBody,
  LogFocusEventParams,
  LogFocusEventBody,
  CompleteFocusSessionParams,
  CompleteFocusSessionBody,
  AbandonFocusSessionParams,
  GetActivePaperFocusSessionParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { getOrCreateFocusProfile } from "../lib/focusProfiles";
import {
  advanceStreak,
  calendarDate,
  encouragementFor,
  isQualifyingSession,
  recommendSession,
} from "../lib/focusGuard";

const router: IRouter = Router();

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Load a session and assert the caller owns it; 404 (not 403) to avoid leaking ids. */
async function loadOwnedSession(
  id: number,
  userId: string,
): Promise<FocusSession | null> {
  const [session] = await db
    .select()
    .from(focusSessionsTable)
    .where(eq(focusSessionsTable.id, id));
  if (!session || session.userId !== userId) return null;
  return session;
}

// ── Profile ──────────────────────────────────────────────────────────────────

router.get("/focus/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const profile = await getOrCreateFocusProfile(userId);
  res.json(profile);
});

router.patch("/focus/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateFocusProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  await getOrCreateFocusProfile(userId);
  const [updated] = await db
    .update(focusProfilesTable)
    .set(parsed.data)
    .where(eq(focusProfilesTable.userId, userId))
    .returning();
  res.json(updated);
});

// ── Recommendation ─────────────────────────────────────────────────────────--

router.get("/focus/recommendation", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetFocusRecommendationQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const profile = await getOrCreateFocusProfile(userId);
  res.json(recommendSession(profile, parsed.data.goalType ?? "read"));
});

// ── Stats ──────────────────────────────────────────────────────────────────--

router.get("/focus/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const profile = await getOrCreateFocusProfile(userId);
  const sessions = await db
    .select()
    .from(focusSessionsTable)
    .where(eq(focusSessionsTable.userId, userId));

  const today = startOfToday();
  let todaySeconds = 0;
  let totalSeconds = 0;
  let completed = 0;
  let abandoned = 0;
  let deepReviews = 0;
  let focusRatingSum = 0;
  let focusRatingN = 0;
  let flowRatingSum = 0;
  let flowRatingN = 0;

  for (const s of sessions) {
    totalSeconds += s.focusedSeconds;
    if (s.startedAt >= today) todaySeconds += s.focusedSeconds;
    if (s.status === "completed") completed++;
    if (s.status === "abandoned") abandoned++;
    if (s.resultReviewId != null && isQualifyingSession(s)) deepReviews++;
    if (s.focusRating != null) {
      focusRatingSum += s.focusRating;
      focusRatingN++;
    }
    if (s.flowRating != null) {
      flowRatingSum += s.flowRating;
      flowRatingN++;
    }
  }

  const todayFocusMinutes = Math.round(todaySeconds / 60);
  res.json({
    todayFocusMinutes,
    dailyGoalMinutes: profile.dailyGoalMinutes,
    dailyGoalMet: todayFocusMinutes >= profile.dailyGoalMinutes,
    streakCount: profile.streakCount,
    longestStreak: profile.longestStreak,
    totalSessions: sessions.length,
    completedSessions: completed,
    abandonedSessions: abandoned,
    totalFocusMinutes: Math.round(totalSeconds / 60),
    deepReviews,
    avgFocusRating: focusRatingN ? Math.round((focusRatingSum / focusRatingN) * 10) / 10 : null,
    avgFlowRating: flowRatingN ? Math.round((flowRatingSum / flowRatingN) * 10) / 10 : null,
  });
});

// ── Sessions ─────────────────────────────────────────────────────────────────

router.get("/focus/sessions", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListFocusSessionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const { status, paperId, limit } = parsed.data;
  const conds = [eq(focusSessionsTable.userId, userId)];
  if (status) conds.push(eq(focusSessionsTable.status, status));
  if (paperId != null) conds.push(eq(focusSessionsTable.paperId, paperId));
  const cap = Math.min(limit ?? 50, 200);
  const rows = await db
    .select()
    .from(focusSessionsTable)
    .where(and(...conds))
    .orderBy(desc(focusSessionsTable.startedAt))
    .limit(cap);
  res.json(rows);
});

router.post("/focus/sessions", requireAuth, async (req, res): Promise<void> => {
  const parsed = StartFocusSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const profile = await getOrCreateFocusProfile(userId);
  const d = parsed.data;
  const [created] = await db
    .insert(focusSessionsTable)
    .values({
      userId,
      paperId: d.paperId ?? null,
      goalType: d.goalType,
      technique: d.technique,
      intent: d.intent,
      plannedMinutes: d.plannedMinutes,
      breakMinutes: d.breakMinutes ?? profile.defaultBreakMinutes,
      status: "active",
    })
    .returning();
  res.status(201).json(created);
});

router.get("/focus/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetFocusSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const session = await loadOwnedSession(params.data.id, userId);
  if (!session) {
    res.status(404).json({ error: "Focus session not found" });
    return;
  }
  const events = await db
    .select()
    .from(focusEventsTable)
    .where(eq(focusEventsTable.sessionId, session.id))
    .orderBy(focusEventsTable.occurredAt);
  res.json({ session, events, qualifiesAsDeep: isQualifyingSession(session) });
});

router.post("/focus/sessions/:id/heartbeat", requireAuth, async (req, res): Promise<void> => {
  const params = HeartbeatFocusSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = HeartbeatFocusSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const session = await loadOwnedSession(params.data.id, userId);
  if (!session) {
    res.status(404).json({ error: "Focus session not found" });
    return;
  }
  if (session.status === "completed" || session.status === "abandoned") {
    res.status(409).json({ error: "Session already ended" });
    return;
  }
  // focusedSeconds is monotonic — never let a stale beat roll it back.
  const focusedSeconds = Math.max(session.focusedSeconds, parsed.data.focusedSeconds);
  const status = parsed.data.status ?? session.status;
  const [updated] = await db
    .update(focusSessionsTable)
    .set({ focusedSeconds, status })
    .where(eq(focusSessionsTable.id, session.id))
    .returning();
  res.json(updated);
});

router.post("/focus/sessions/:id/events", requireAuth, async (req, res): Promise<void> => {
  const params = LogFocusEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = LogFocusEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const session = await loadOwnedSession(params.data.id, userId);
  if (!session) {
    res.status(404).json({ error: "Focus session not found" });
    return;
  }
  const [event] = await db
    .insert(focusEventsTable)
    .values({ sessionId: session.id, kind: parsed.data.kind, note: parsed.data.note ?? null })
    .returning();

  // Keep denormalised counters on the session in sync with the log.
  if (parsed.data.kind === "distraction") {
    await db
      .update(focusSessionsTable)
      .set({ distractionCount: session.distractionCount + 1 })
      .where(eq(focusSessionsTable.id, session.id));
  } else if (parsed.data.kind === "break_start") {
    await db
      .update(focusSessionsTable)
      .set({ breaksTaken: session.breaksTaken + 1 })
      .where(eq(focusSessionsTable.id, session.id));
  }
  res.status(201).json(event);
});

router.post("/focus/sessions/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const params = CompleteFocusSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CompleteFocusSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const session = await loadOwnedSession(params.data.id, userId);
  if (!session) {
    res.status(404).json({ error: "Focus session not found" });
    return;
  }
  if (session.status === "completed") {
    res.status(409).json({ error: "Session already completed" });
    return;
  }

  const focusedSeconds = Math.max(session.focusedSeconds, parsed.data.focusedSeconds);
  const [completed] = await db
    .update(focusSessionsTable)
    .set({
      status: "completed",
      endedAt: new Date(),
      focusedSeconds,
      focusRating: parsed.data.focusRating ?? null,
      flowRating: parsed.data.flowRating ?? null,
      reflection: parsed.data.reflection ?? null,
    })
    .where(eq(focusSessionsTable.id, session.id))
    .returning();

  const qualifies = isQualifyingSession(completed);

  // Advance the streak only on qualifying work.
  const profile = await getOrCreateFocusProfile(userId);
  let streakCount = profile.streakCount;
  let streakChanged = false;
  if (qualifies) {
    const outcome = advanceStreak(profile);
    streakCount = outcome.streakCount;
    streakChanged = outcome.changed;
    await db
      .update(focusProfilesTable)
      .set({
        streakCount: outcome.streakCount,
        longestStreak: outcome.longestStreak,
        lastQualifyingDate: outcome.lastQualifyingDate,
      })
      .where(eq(focusProfilesTable.userId, userId));
  }

  // Has today's cumulative focus cleared the daily goal?
  const today = startOfToday();
  const userSessions = await db
    .select({ startedAt: focusSessionsTable.startedAt, focusedSeconds: focusSessionsTable.focusedSeconds })
    .from(focusSessionsTable)
    .where(eq(focusSessionsTable.userId, userId));
  const todaySeconds = userSessions
    .filter((s) => s.startedAt >= today)
    .reduce((sum, s) => sum + s.focusedSeconds, 0);
  const dailyGoalMet = Math.round(todaySeconds / 60) >= profile.dailyGoalMinutes;

  const focusedMinutes = Math.round(focusedSeconds / 60);
  res.json({
    session: completed,
    qualifiesAsDeep: qualifies,
    streakCount,
    streakChanged,
    dailyGoalMet,
    encouragement: encouragementFor({
      qualifies,
      streakCount,
      streakChanged,
      dailyGoalMet,
      focusedMinutes,
      distractionCount: completed.distractionCount,
    }),
  });
});

router.post("/focus/sessions/:id/abandon", requireAuth, async (req, res): Promise<void> => {
  const params = AbandonFocusSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const session = await loadOwnedSession(params.data.id, userId);
  if (!session) {
    res.status(404).json({ error: "Focus session not found" });
    return;
  }
  const [updated] = await db
    .update(focusSessionsTable)
    .set({ status: "abandoned", endedAt: new Date() })
    .where(eq(focusSessionsTable.id, session.id))
    .returning();
  res.json(updated);
});

router.get("/papers/:id/focus/active", requireAuth, async (req, res): Promise<void> => {
  const params = GetActivePaperFocusSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const [session] = await db
    .select()
    .from(focusSessionsTable)
    .where(
      and(
        eq(focusSessionsTable.userId, userId),
        eq(focusSessionsTable.paperId, params.data.id),
        inArray(focusSessionsTable.status, ["active", "paused"]),
      ),
    )
    .orderBy(desc(focusSessionsTable.startedAt))
    .limit(1);
  res.json(session ?? null);
});

export default router;
