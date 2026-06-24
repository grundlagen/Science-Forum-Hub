import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  focusPreferencesTable,
  focusSessionsTable,
  type FocusDistraction,
} from "@workspace/db";
import {
  UpdateFocusPreferencesBody,
  ListFocusSessionsQueryParams,
  StartFocusSessionBody,
  GetFocusSessionParams,
  UpdateFocusSessionProgressParams,
  UpdateFocusSessionProgressBody,
  ParkFocusDistractionParams,
  ParkFocusDistractionBody,
  CompleteFocusSessionParams,
  CompleteFocusSessionBody,
  AbandonFocusSessionParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import {
  getOrCreateFocusPreferences,
  getActiveFocusSession,
  reapStaleActiveSessions,
  focusSessionToPublic,
  computeFocusStats,
} from "../lib/focus";

const router: IRouter = Router();

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

/** Fetch a session by id, scoped to the authenticated user. */
async function getOwnedSession(id: number, userId: string) {
  const [row] = await db
    .select()
    .from(focusSessionsTable)
    .where(
      and(eq(focusSessionsTable.id, id), eq(focusSessionsTable.userId, userId)),
    );
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

router.get("/focus/preferences", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const prefs = await getOrCreateFocusPreferences(userId);
  res.json(prefs);
});

router.put("/focus/preferences", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateFocusPreferencesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  await getOrCreateFocusPreferences(userId);

  // Only persist fields the caller actually provided (partial update).
  const patch = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  );

  const [row] = await db
    .update(focusPreferencesTable)
    .set(patch)
    .where(eq(focusPreferencesTable.userId, userId))
    .returning();
  res.json(row);
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

router.get("/focus/sessions", requireAuth, async (req, res): Promise<void> => {
  const params = ListFocusSessionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  await reapStaleActiveSessions(userId);

  const { status, limit } = params.data;
  const filters = [eq(focusSessionsTable.userId, userId)];
  if (status && status !== "all") {
    filters.push(eq(focusSessionsTable.status, status));
  }

  const rows = await db
    .select()
    .from(focusSessionsTable)
    .where(and(...filters))
    .orderBy(desc(focusSessionsTable.startedAt))
    .limit(Math.min(limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT));

  res.json(rows.map(focusSessionToPublic));
});

router.get(
  "/focus/sessions/active",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = (req as AuthedRequest).userId;
    const active = await getActiveFocusSession(userId);
    res.json({ session: active ? focusSessionToPublic(active) : null });
  },
);

router.get("/focus/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const stats = await computeFocusStats(userId);
  res.json(stats);
});

router.post("/focus/sessions", requireAuth, async (req, res): Promise<void> => {
  const parsed = StartFocusSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;

  // One deep-work sprint at a time — single-tasking is the whole point.
  const active = await getActiveFocusSession(userId);
  if (active) {
    res.status(409).json({
      error: "A focus session is already active. Complete or abandon it first.",
    });
    return;
  }

  const [row] = await db
    .insert(focusSessionsTable)
    .values({
      userId,
      intention: parsed.data.intention,
      technique: parsed.data.technique,
      intent: parsed.data.intent ?? "read",
      plannedMinutes: parsed.data.plannedMinutes,
      goalType: parsed.data.goalType ?? "minutes",
      goalTarget: parsed.data.goalTarget ?? 1,
      paperId: parsed.data.paperId ?? null,
      field: parsed.data.field ?? null,
      energyBefore: parsed.data.energyBefore ?? null,
    })
    .returning();

  res.status(201).json(focusSessionToPublic(row));
});

router.get("/focus/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetFocusSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const row = await getOwnedSession(params.data.id, userId);
  if (!row) {
    res.status(404).json({ error: "Focus session not found" });
    return;
  }
  res.json(focusSessionToPublic(row));
});

router.patch(
  "/focus/sessions/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateFocusSessionProgressParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateFocusSessionProgressBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = (req as AuthedRequest).userId;
    const existing = await getOwnedSession(params.data.id, userId);
    if (!existing) {
      res.status(404).json({ error: "Focus session not found" });
      return;
    }
    if (existing.status !== "active") {
      res.status(409).json({ error: "Focus session is not active" });
      return;
    }

    const { addSeconds, goalProgress, breaksTaken } = parsed.data;
    const patch: Record<string, unknown> = {};
    if (addSeconds != null && addSeconds > 0) {
      // Increment server-side to stay race-safe across overlapping heartbeats.
      patch.focusSeconds = sql`${focusSessionsTable.focusSeconds} + ${addSeconds}`;
    }
    if (goalProgress != null) patch.goalProgress = goalProgress;
    if (breaksTaken != null) patch.breaksTaken = breaksTaken;

    if (Object.keys(patch).length === 0) {
      res.json(focusSessionToPublic(existing));
      return;
    }

    const [row] = await db
      .update(focusSessionsTable)
      .set(patch)
      .where(eq(focusSessionsTable.id, params.data.id))
      .returning();
    res.json(focusSessionToPublic(row));
  },
);

router.post(
  "/focus/sessions/:id/distractions",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ParkFocusDistractionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = ParkFocusDistractionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = (req as AuthedRequest).userId;
    const existing = await getOwnedSession(params.data.id, userId);
    if (!existing) {
      res.status(404).json({ error: "Focus session not found" });
      return;
    }

    const distraction: FocusDistraction = {
      id: randomUUID(),
      text: parsed.data.text,
      kind: parsed.data.kind ?? "thought",
      parkedAt: new Date().toISOString(),
      resolved: false,
    };
    const distractions = [...existing.distractions, distraction];

    const [row] = await db
      .update(focusSessionsTable)
      .set({ distractions, distractionCount: distractions.length })
      .where(eq(focusSessionsTable.id, params.data.id))
      .returning();
    res.json(focusSessionToPublic(row));
  },
);

router.post(
  "/focus/sessions/:id/complete",
  requireAuth,
  async (req, res): Promise<void> => {
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
    const existing = await getOwnedSession(params.data.id, userId);
    if (!existing) {
      res.status(404).json({ error: "Focus session not found" });
      return;
    }

    const patch: Record<string, unknown> = {
      status: "completed",
      endedAt: new Date(),
    };
    if (parsed.data.focusRating != null) patch.focusRating = parsed.data.focusRating;
    if (parsed.data.moodAfter != null) patch.moodAfter = parsed.data.moodAfter;
    if (parsed.data.reflection != null) patch.reflection = parsed.data.reflection;
    if (parsed.data.goalProgress != null) patch.goalProgress = parsed.data.goalProgress;

    const [row] = await db
      .update(focusSessionsTable)
      .set(patch)
      .where(eq(focusSessionsTable.id, params.data.id))
      .returning();
    res.json(focusSessionToPublic(row));
  },
);

router.post(
  "/focus/sessions/:id/abandon",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = AbandonFocusSessionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const userId = (req as AuthedRequest).userId;
    const existing = await getOwnedSession(params.data.id, userId);
    if (!existing) {
      res.status(404).json({ error: "Focus session not found" });
      return;
    }

    const [row] = await db
      .update(focusSessionsTable)
      .set({ status: "abandoned", endedAt: new Date() })
      .where(eq(focusSessionsTable.id, params.data.id))
      .returning();
    res.json(focusSessionToPublic(row));
  },
);

export default router;
