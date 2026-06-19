import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  focusSessionsTable,
  focusEventsTable,
  focusPreferencesTable,
  type SessionState,
} from "@workspace/db";
import {
  assessIntention,
  recommendBlock,
  computeFocusScore,
  buildReflection,
  decideContextSwitch,
  computeStreaks,
  adviseDailyLoad,
  TECHNIQUE_PRESETS,
  type DaySummary,
} from "@workspace/focus-engine";
import {
  AssessFocusIntentionBody,
  RecommendFocusBlockBody,
  UpdateFocusPreferencesBody,
  StartFocusSessionBody,
  ListFocusSessionsQueryParams,
  GetFocusSessionParams,
  LogFocusEventParams,
  LogFocusEventBody,
  CompleteFocusSessionParams,
  CompleteFocusSessionBody,
  CheckFocusGuardBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import {
  serializeSession,
  serializeEvent,
  serializePreferences,
  getOrCreatePreferences,
  localDay,
} from "../lib/focusGuard";

const router: IRouter = Router();

// --- Reference / pure-compute endpoints (no auth needed) ---------------------

router.get("/focus/techniques", (_req, res): void => {
  res.json(Object.values(TECHNIQUE_PRESETS));
});

router.post("/focus/intention/assess", (req, res): void => {
  const parsed = AssessFocusIntentionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(assessIntention(parsed.data.text));
});

router.post("/focus/recommend", (req, res): void => {
  const parsed = RecommendFocusBlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(recommendBlock(parsed.data));
});

router.post("/focus/guard/check", (req, res): void => {
  const parsed = CheckFocusGuardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(decideContextSwitch(parsed.data));
});

// --- Preferences -------------------------------------------------------------

router.get("/focus/preferences", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const prefs = await getOrCreatePreferences(userId);
  res.json(serializePreferences(prefs));
});

router.put("/focus/preferences", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateFocusPreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  await getOrCreatePreferences(userId); // ensure a row exists
  const [row] = await db
    .update(focusPreferencesTable)
    .set({
      defaultTechnique: parsed.data.defaultTechnique,
      defaultMode: parsed.data.defaultMode,
      guardLevel: parsed.data.guardLevel,
      chronotype: parsed.data.chronotype,
      dailyGoalMinutes: parsed.data.dailyGoalMinutes,
      muteNotifications: parsed.data.muteNotifications,
    })
    .where(eq(focusPreferencesTable.userId, userId))
    .returning();
  res.json(serializePreferences(row));
});

// --- Sessions ----------------------------------------------------------------

router.post("/focus/sessions", requireAuth, async (req, res): Promise<void> => {
  const parsed = StartFocusSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const intentionScore = assessIntention(parsed.data.intention).score;
  const [row] = await db
    .insert(focusSessionsTable)
    .values({
      userId,
      intention: parsed.data.intention,
      intentionScore,
      mode: parsed.data.mode,
      technique: parsed.data.technique,
      targetPaperId: parsed.data.targetPaperId ?? null,
      plannedMinutes: parsed.data.plannedMinutes,
      energyBefore: parsed.data.energyBefore ?? null,
      state: "active",
      startedAt: new Date(),
    })
    .returning();
  res.status(201).json(serializeSession(row));
});

router.get("/focus/sessions", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListFocusSessionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const limit = Math.min(parsed.data.limit ?? 50, 200);
  const where = parsed.data.state
    ? and(
        eq(focusSessionsTable.userId, userId),
        eq(focusSessionsTable.state, parsed.data.state as SessionState),
      )
    : eq(focusSessionsTable.userId, userId);
  const rows = await db
    .select()
    .from(focusSessionsTable)
    .where(where)
    .orderBy(desc(focusSessionsTable.createdAt))
    .limit(limit);
  res.json(rows.map(serializeSession));
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
  res.json({ session: serializeSession(session), events: events.map(serializeEvent) });
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
    .values({ sessionId: session.id, kind: parsed.data.kind, note: parsed.data.note ?? null })
    .returning();

  // Keep the denormalised tallies on the session in step with the timeline.
  if (parsed.data.kind === "distraction") {
    await db
      .update(focusSessionsTable)
      .set({ distractionCount: sql`${focusSessionsTable.distractionCount} + 1` })
      .where(eq(focusSessionsTable.id, session.id));
  } else if (parsed.data.kind === "parked_thought") {
    await db
      .update(focusSessionsTable)
      .set({ parkedThoughtCount: sql`${focusSessionsTable.parkedThoughtCount} + 1` })
      .where(eq(focusSessionsTable.id, session.id));
  }

  res.status(201).json(serializeEvent(event));
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
  const [session] = await db
    .select()
    .from(focusSessionsTable)
    .where(and(eq(focusSessionsTable.id, params.data.id), eq(focusSessionsTable.userId, userId)));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const score = computeFocusScore({
    plannedMinutes: session.plannedMinutes,
    focusedMinutes: parsed.data.focusedMinutes,
    distractionCount: session.distractionCount,
    parkedThoughts: session.parkedThoughtCount,
    flowRating: parsed.data.flowRating ?? null,
    intentionOutcome: parsed.data.intentionOutcome,
  });

  const [updated] = await db
    .update(focusSessionsTable)
    .set({
      state: parsed.data.abandoned ? "abandoned" : "completed",
      focusedMinutes: parsed.data.focusedMinutes,
      flowRating: parsed.data.flowRating ?? null,
      energyAfter: parsed.data.energyAfter ?? null,
      intentionOutcome: parsed.data.intentionOutcome,
      focusScore: score.score,
      endedAt: new Date(),
    })
    .where(eq(focusSessionsTable.id, session.id))
    .returning();

  const reflection = buildReflection({
    intention: updated.intention,
    intentionOutcome: parsed.data.intentionOutcome,
    plannedMinutes: updated.plannedMinutes,
    focusedMinutes: parsed.data.focusedMinutes,
    distractionCount: updated.distractionCount,
    parkedThoughts: updated.parkedThoughtCount,
    score,
  });

  res.json({ session: serializeSession(updated), score, reflection });
});

// --- Stats -------------------------------------------------------------------

router.get("/focus/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const prefs = await getOrCreatePreferences(userId);
  const rows = await db
    .select()
    .from(focusSessionsTable)
    .where(eq(focusSessionsTable.userId, userId));

  const today = localDay(new Date());

  // Roll sessions up into per-day focused minutes for streak math.
  const byDay = new Map<string, number>();
  let lifetimeFocusedMinutes = 0;
  let completedSessions = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  for (const r of rows) {
    const day = localDay(r.createdAt);
    byDay.set(day, (byDay.get(day) ?? 0) + r.focusedMinutes);
    lifetimeFocusedMinutes += r.focusedMinutes;
    if (r.state === "completed") completedSessions += 1;
    if (r.focusScore != null) {
      scoreSum += r.focusScore;
      scoreCount += 1;
    }
  }
  const summaries: DaySummary[] = [...byDay.entries()].map(([date, focusedMinutes]) => ({
    date,
    focusedMinutes,
  }));

  const streak = computeStreaks(summaries, today);
  const focusedMinutesToday = byDay.get(today) ?? 0;
  const todayAdvice = adviseDailyLoad(focusedMinutesToday, prefs.dailyGoalMinutes);

  res.json({
    streak,
    today: todayAdvice,
    focusedMinutesToday,
    totalSessions: rows.length,
    completedSessions,
    lifetimeFocusedMinutes,
    averageFocusScore: scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : null,
  });
});

export default router;
