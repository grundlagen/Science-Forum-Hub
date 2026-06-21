import { Router, type IRouter } from "express";
import { and, eq, desc, gte, sql } from "drizzle-orm";
import {
  db,
  focusProfilesTable,
  focusSessionsTable,
  focusEventsTable,
  type FocusProfile,
  type FocusSession,
} from "@workspace/db";
import {
  UpdateFocusProfileBody,
  StartFocusSessionBody,
  GetFocusSessionParams,
  LogFocusEventParams,
  LogFocusEventBody,
  CompleteFocusSessionParams,
  CompleteFocusSessionBody,
  AbandonFocusSessionParams,
  ListFocusSessionsQueryParams,
  GetReviewReadinessQueryParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import {
  FOCUS_CONSTANTS,
  computeFocusScore,
  recommendSession,
  assessReviewReadiness,
  applyStreak,
  reflectionFor,
  localDateString,
  clamp,
} from "../lib/focus";

const router: IRouter = Router();

/** Fetch the caller's focus profile, creating a default one on first touch. */
async function getOrCreateFocusProfile(userId: string): Promise<FocusProfile> {
  const [existing] = await db
    .select()
    .from(focusProfilesTable)
    .where(eq(focusProfilesTable.userId, userId));
  if (existing) return existing;
  const [created] = await db
    .insert(focusProfilesTable)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  // Lost the insert race — read the row the other writer created.
  const [row] = await db
    .select()
    .from(focusProfilesTable)
    .where(eq(focusProfilesTable.userId, userId));
  return row;
}

/** Strip the internal `payload` jsonb before returning an event to the client. */
function publicEvent(e: typeof focusEventsTable.$inferSelect) {
  return {
    id: e.id,
    sessionId: e.sessionId,
    userId: e.userId,
    type: e.type,
    note: e.note,
    createdAt: e.createdAt,
  };
}

async function getActiveSession(userId: string): Promise<FocusSession | null> {
  const [row] = await db
    .select()
    .from(focusSessionsTable)
    .where(and(eq(focusSessionsTable.userId, userId), eq(focusSessionsTable.status, "active")))
    .orderBy(desc(focusSessionsTable.startedAt))
    .limit(1);
  return row ?? null;
}

function startOfTodayUtc(now: Date): Date {
  return new Date(`${localDateString(now, "UTC")}T00:00:00.000Z`);
}

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

router.get("/focus/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const now = new Date();
  const profile = await getOrCreateFocusProfile(userId);

  const todayStart = startOfTodayUtc(now);
  const todaysCompleted = await db
    .select()
    .from(focusSessionsTable)
    .where(
      and(
        eq(focusSessionsTable.userId, userId),
        eq(focusSessionsTable.status, "completed"),
        gte(focusSessionsTable.startedAt, todayStart),
      ),
    )
    .orderBy(desc(focusSessionsTable.startedAt));

  const recentSessions = await db
    .select()
    .from(focusSessionsTable)
    .where(eq(focusSessionsTable.userId, userId))
    .orderBy(desc(focusSessionsTable.startedAt))
    .limit(10);

  const activeSession = await getActiveSession(userId);

  const focusMinutes = Math.round(
    todaysCompleted.reduce((s, x) => s + x.actualFocusSeconds, 0) / 60,
  );
  const scores = todaysCompleted
    .map((s) => s.focusScore)
    .filter((s): s is number => s != null);
  const averageFocusScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;

  const today = {
    date: localDateString(now, "UTC"),
    focusMinutes,
    sessionsCompleted: todaysCompleted.length,
    goalMinutes: profile.dailyGoalMinutes,
    goalMet: focusMinutes >= profile.dailyGoalMinutes,
    averageFocusScore,
  };

  const recommendation = recommendSession({
    profile,
    todaysSessions: todaysCompleted.map((s) => ({
      actualFocusSeconds: s.actualFocusSeconds,
      depletionAfter: s.depletionAfter,
      endedAt: s.endedAt,
      flowRating: s.flowRating,
    })),
    now,
  });

  res.json({ profile, today, recommendation, activeSession, recentSessions });
});

router.get("/focus/sessions", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListFocusSessionsQueryParams.safeParse(req.query);
  const userId = (req as AuthedRequest).userId;
  const limit = clamp(parsed.success && parsed.data.limit ? parsed.data.limit : 20, 1, 100);
  const rows = await db
    .select()
    .from(focusSessionsTable)
    .where(eq(focusSessionsTable.userId, userId))
    .orderBy(desc(focusSessionsTable.startedAt))
    .limit(limit);
  res.json(rows);
});

router.post("/focus/sessions", requireAuth, async (req, res): Promise<void> => {
  const parsed = StartFocusSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;

  // One paper, one session — mono-tasking is the whole point (attention residue).
  const active = await getActiveSession(userId);
  if (active) {
    res.status(400).json({
      error: "You already have an active focus session. Finish or abandon it first.",
    });
    return;
  }

  const profile = await getOrCreateFocusProfile(userId);
  const plannedMinutes = clamp(
    parsed.data.plannedMinutes ?? profile.preferredSessionMinutes,
    FOCUS_CONSTANTS.MIN_SESSION_MINUTES,
    FOCUS_CONSTANTS.MAX_SESSION_MINUTES,
  );

  const [row] = await db
    .insert(focusSessionsTable)
    .values({
      userId,
      intent: parsed.data.intent,
      mode: parsed.data.mode ?? "review",
      paperId: parsed.data.paperId ?? null,
      plannedMinutes,
      depletionBefore: parsed.data.depletionBefore ?? null,
    })
    .returning();
  res.status(201).json(row);
});

router.get("/focus/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetFocusSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const [session] = await db
    .select()
    .from(focusSessionsTable)
    .where(and(eq(focusSessionsTable.id, params.data.id), eq(focusSessionsTable.userId, userId)));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const events = await db
    .select()
    .from(focusEventsTable)
    .where(eq(focusEventsTable.sessionId, session.id))
    .orderBy(focusEventsTable.createdAt);
  res.json({ session, events: events.map(publicEvent) });
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
  const [session] = await db
    .select()
    .from(focusSessionsTable)
    .where(and(eq(focusSessionsTable.id, params.data.id), eq(focusSessionsTable.userId, userId)));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [event] = await db
    .insert(focusEventsTable)
    .values({
      sessionId: session.id,
      userId,
      type: parsed.data.type,
      note: parsed.data.note ?? null,
    })
    .returning();

  // Interruptions feed the focus-score penalty; count them as they happen.
  if (parsed.data.type === "interruption") {
    await db
      .update(focusSessionsTable)
      .set({ interruptionCount: sql`${focusSessionsTable.interruptionCount} + 1` })
      .where(eq(focusSessionsTable.id, session.id));
  }

  res.status(201).json(publicEvent(event));
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
  const now = new Date();

  const [session] = await db
    .select()
    .from(focusSessionsTable)
    .where(and(eq(focusSessionsTable.id, params.data.id), eq(focusSessionsTable.userId, userId)));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (session.status !== "active") {
    res.status(400).json({ error: "Session is not active" });
    return;
  }

  const profile = await getOrCreateFocusProfile(userId);
  const flowRating = parsed.data.flowRating ?? null;
  const focusScore = computeFocusScore({
    plannedMinutes: session.plannedMinutes,
    actualFocusSeconds: parsed.data.actualFocusSeconds,
    interruptionCount: session.interruptionCount,
    flowRating,
  });
  const reflection = reflectionFor(
    focusScore,
    session.mode,
    session.interruptionCount,
    profile.gentleMode,
  );

  const [updated] = await db
    .update(focusSessionsTable)
    .set({
      status: "completed",
      endedAt: now,
      actualFocusSeconds: parsed.data.actualFocusSeconds,
      flowRating,
      depletionAfter: parsed.data.depletionAfter ?? null,
      focusScore,
      reflection: parsed.data.reflection ?? reflection,
    })
    .where(eq(focusSessionsTable.id, session.id))
    .returning();

  // Roll up lifetime aggregates and the kind streak.
  const today = localDateString(now, "UTC");
  const streak = applyStreak(profile, today);
  const minutes = Math.round(parsed.data.actualFocusSeconds / 60);
  const [updatedProfile] = await db
    .update(focusProfilesTable)
    .set({
      totalFocusMinutes: profile.totalFocusMinutes + minutes,
      sessionsCompleted: profile.sessionsCompleted + 1,
      currentStreakDays: streak.currentStreakDays,
      longestStreakDays: streak.longestStreakDays,
      graceTokens: streak.graceTokens,
      lastSessionDate: streak.lastSessionDate,
    })
    .where(eq(focusProfilesTable.userId, userId))
    .returning();

  // Did this push the day over the goal line?
  const todayStart = startOfTodayUtc(now);
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${focusSessionsTable.actualFocusSeconds}), 0)::int` })
    .from(focusSessionsTable)
    .where(
      and(
        eq(focusSessionsTable.userId, userId),
        eq(focusSessionsTable.status, "completed"),
        gte(focusSessionsTable.startedAt, todayStart),
      ),
    );
  const goalMet = Math.round(total / 60) >= updatedProfile.dailyGoalMinutes;

  res.json({
    session: updated,
    reflection,
    streakDays: updatedProfile.currentStreakDays,
    goalMet,
  });
});

router.post("/focus/sessions/:id/abandon", requireAuth, async (req, res): Promise<void> => {
  const params = AbandonFocusSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const [session] = await db
    .select()
    .from(focusSessionsTable)
    .where(and(eq(focusSessionsTable.id, params.data.id), eq(focusSessionsTable.userId, userId)));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const [updated] = await db
    .update(focusSessionsTable)
    .set({ status: "abandoned", endedAt: new Date() })
    .where(eq(focusSessionsTable.id, session.id))
    .returning();
  res.json(updated);
});

router.get("/focus/review-readiness", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetReviewReadinessQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const profile = await getOrCreateFocusProfile(userId);
  const active = await getActiveSession(userId);

  // zod.coerce.boolean treats "false" as true, so read the raw query value.
  const raw = req.query.blindPassDone;
  const blindPassDone =
    raw === "true" ? true : raw === "false" ? false : undefined;

  const readiness = assessReviewReadiness({
    profile,
    stance: parsed.data.stance,
    depletion: active?.depletionBefore ?? null,
    blindPassDone,
    hasActiveFocusSession: active != null,
  });
  res.json(readiness);
});

export default router;
