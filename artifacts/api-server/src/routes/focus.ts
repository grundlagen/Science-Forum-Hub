import { Router, type IRouter } from "express";
import { and, eq, desc, sql } from "drizzle-orm";
import {
  db,
  focusSessionsTable,
  focusDistractionsTable,
  focusPreferencesTable,
  type FocusPreferences,
} from "@workspace/db";
import {
  UpdateFocusPreferencesBody,
  ListFocusSessionsQueryParams,
  StartFocusSessionBody,
  GetFocusSessionParams,
  UpdateFocusSessionParams,
  UpdateFocusSessionBody,
  LogFocusDistractionParams,
  LogFocusDistractionBody,
  ResolveFocusDistractionParams,
  ResolveFocusDistractionBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import {
  serializeSession,
  serializeDistraction,
  computeStats,
} from "../lib/focusHelpers";

const router: IRouter = Router();

/** Lazily materialize a user's preference row so every endpoint can assume it exists. */
async function getOrCreatePreferences(userId: string): Promise<FocusPreferences> {
  const [existing] = await db
    .select()
    .from(focusPreferencesTable)
    .where(eq(focusPreferencesTable.userId, userId));
  if (existing) return existing;
  const [created] = await db
    .insert(focusPreferencesTable)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  // Lost an insert race; read the winner.
  const [row] = await db
    .select()
    .from(focusPreferencesTable)
    .where(eq(focusPreferencesTable.userId, userId));
  return row;
}

function serializePreferences(p: FocusPreferences) {
  return {
    userId: p.userId,
    defaultCadence: p.defaultCadence,
    defaultPlannedMinutes: p.defaultPlannedMinutes,
    defaultBreakMinutes: p.defaultBreakMinutes,
    dailyGoalMinutes: p.dailyGoalMinutes,
    guards: p.guards,
    gentleMode: p.gentleMode,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ── Preferences ──────────────────────────────────────────────────────────────

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
  await getOrCreatePreferences(userId);
  const [row] = await db
    .update(focusPreferencesTable)
    .set(parsed.data)
    .where(eq(focusPreferencesTable.userId, userId))
    .returning();
  res.json(serializePreferences(row));
});

// ── Sessions ─────────────────────────────────────────────────────────────────

router.get("/focus/sessions", requireAuth, async (req, res): Promise<void> => {
  const query = ListFocusSessionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const { status, limit } = query.data;
  const where =
    status && status !== "all"
      ? and(eq(focusSessionsTable.userId, userId), eq(focusSessionsTable.status, status))
      : eq(focusSessionsTable.userId, userId);

  const rows = await db
    .select()
    .from(focusSessionsTable)
    .where(where)
    .orderBy(desc(focusSessionsTable.createdAt))
    .limit(Math.min(limit ?? 50, 200));
  res.json(rows.map(serializeSession));
});

router.post("/focus/sessions", requireAuth, async (req, res): Promise<void> => {
  const parsed = StartFocusSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const prefs = await getOrCreatePreferences(userId);
  const b = parsed.data;

  // Starting a session begins the clock immediately — the act of committing to
  // an intention is the intervention, so we don't sit in a "planned" limbo.
  const [row] = await db
    .insert(focusSessionsTable)
    .values({
      userId,
      paperId: b.paperId ?? null,
      activity: b.activity ?? "deep_work",
      intention: b.intention,
      cadence: b.cadence ?? prefs.defaultCadence,
      plannedMinutes: b.plannedMinutes ?? prefs.defaultPlannedMinutes,
      breakMinutes: b.breakMinutes ?? prefs.defaultBreakMinutes,
      guards: b.guards ?? prefs.guards,
      energyBefore: b.energyBefore ?? null,
      status: "active",
      startedAt: new Date(),
    })
    .returning();
  res.status(201).json(serializeSession(row));
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
    .where(eq(focusSessionsTable.id, params.data.id));
  if (!session || session.userId !== userId) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const distractions = await db
    .select()
    .from(focusDistractionsTable)
    .where(eq(focusDistractionsTable.sessionId, session.id))
    .orderBy(desc(focusDistractionsTable.createdAt));
  res.json({
    session: serializeSession(session),
    distractions: distractions.map(serializeDistraction),
  });
});

router.patch("/focus/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateFocusSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateFocusSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const [existing] = await db
    .select()
    .from(focusSessionsTable)
    .where(eq(focusSessionsTable.id, params.data.id));
  if (!existing || existing.userId !== userId) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const patch = parsed.data;
  const terminal = patch.status === "completed" || patch.status === "abandoned";
  const [row] = await db
    .update(focusSessionsTable)
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.focusedSeconds !== undefined ? { focusedSeconds: patch.focusedSeconds } : {}),
      ...(patch.flowScore !== undefined ? { flowScore: patch.flowScore } : {}),
      ...(patch.energyAfter !== undefined ? { energyAfter: patch.energyAfter } : {}),
      ...(patch.reflection !== undefined ? { reflection: patch.reflection } : {}),
      // Stamp the end exactly once, when the session first reaches a terminal state.
      ...(terminal && existing.endedAt == null ? { endedAt: new Date() } : {}),
    })
    .where(eq(focusSessionsTable.id, params.data.id))
    .returning();
  res.json(serializeSession(row));
});

// ── Distractions (the parking lot) ────────────────────────────────────────────

router.post(
  "/focus/sessions/:id/distractions",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = LogFocusDistractionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = LogFocusDistractionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = (req as AuthedRequest).userId;
    const [session] = await db
      .select()
      .from(focusSessionsTable)
      .where(eq(focusSessionsTable.id, params.data.id));
    if (!session || session.userId !== userId) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const [row] = await db
      .insert(focusDistractionsTable)
      .values({
        sessionId: session.id,
        userId,
        kind: parsed.data.kind,
        note: parsed.data.note,
        breached: parsed.data.breached ?? false,
      })
      .returning();
    await db
      .update(focusSessionsTable)
      .set({ distractionCount: sql`${focusSessionsTable.distractionCount} + 1` })
      .where(eq(focusSessionsTable.id, session.id));
    res.status(201).json(serializeDistraction(row));
  },
);

router.patch(
  "/focus/sessions/:id/distractions/:distractionId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ResolveFocusDistractionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = ResolveFocusDistractionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = (req as AuthedRequest).userId;
    const [row] = await db
      .update(focusDistractionsTable)
      .set({ resolved: parsed.data.resolved })
      .where(
        and(
          eq(focusDistractionsTable.id, params.data.distractionId),
          eq(focusDistractionsTable.sessionId, params.data.id),
          eq(focusDistractionsTable.userId, userId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Distraction not found" });
      return;
    }
    res.json(serializeDistraction(row));
  },
);

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get("/focus/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const prefs = await getOrCreatePreferences(userId);
  const sessions = await db
    .select()
    .from(focusSessionsTable)
    .where(eq(focusSessionsTable.userId, userId));
  const distractions = await db
    .select()
    .from(focusDistractionsTable)
    .where(eq(focusDistractionsTable.userId, userId));
  res.json(computeStats(sessions, distractions, prefs.dailyGoalMinutes));
});

export default router;
