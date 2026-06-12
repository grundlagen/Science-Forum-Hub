import { Router, type IRouter } from "express";
import { and, eq, isNull, desc, gte, inArray, count } from "drizzle-orm";
import {
  db,
  focusSessionsTable,
  focusCapturesTable,
  focusSettingsTable,
  papersTable,
  type FocusSession,
  type FocusSettings,
} from "@workspace/db";
import {
  UpdateFocusSettingsBody,
  StartFocusSessionBody,
  ListFocusSessionsQueryParams,
  EndFocusSessionParams,
  EndFocusSessionBody,
  CreateFocusCaptureParams,
  CreateFocusCaptureBody,
  ListFocusCapturesParams,
  ResolveFocusCaptureParams,
  ResolveFocusCaptureBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import {
  clampPlannedMinutes,
  elapsedSeconds,
  remainingSeconds,
  isExpired,
  deriveOutcome,
  requiresAbandonReason,
  suggestBreakMinutes,
  weekStart,
  median,
  weeksActive,
  closureMessage,
  COMPLETION_WINDOW_DAYS,
} from "../lib/focusGuard";

const router: IRouter = Router();

async function getOrCreateSettings(userId: string): Promise<FocusSettings> {
  const [existing] = await db
    .select()
    .from(focusSettingsTable)
    .where(eq(focusSettingsTable.userId, userId));
  if (existing) return existing;
  const [created] = await db
    .insert(focusSettingsTable)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [raced] = await db
    .select()
    .from(focusSettingsTable)
    .where(eq(focusSettingsTable.userId, userId));
  return raced;
}

function settingsToPublic(s: FocusSettings) {
  return {
    defaultMinutes: s.defaultMinutes,
    defaultLockMode: s.defaultLockMode,
    weeklyTargetMinutes: s.weeklyTargetMinutes,
    quietFeed: s.quietFeed,
  };
}

function sessionToPublic(
  s: FocusSession,
  paperTitle: string | null,
  captureCount: number,
) {
  return {
    id: s.id,
    paperId: s.paperId,
    paperTitle,
    intention: s.intention,
    plannedMinutes: s.plannedMinutes,
    lockMode: s.lockMode,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    outcome: s.outcome,
    actualSeconds: s.actualSeconds,
    felt: s.felt,
    closingNote: s.closingNote,
    captureCount,
  };
}

async function paperTitlesByIds(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return map;
  const rows = await db
    .select({ id: papersTable.id, title: papersTable.title })
    .from(papersTable)
    .where(inArray(papersTable.id, wanted));
  for (const row of rows) map.set(row.id, row.title);
  return map;
}

async function captureCountsBySession(sessionIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (sessionIds.length === 0) return map;
  const rows = await db
    .select({ sessionId: focusCapturesTable.sessionId, n: count() })
    .from(focusCapturesTable)
    .where(inArray(focusCapturesTable.sessionId, sessionIds))
    .groupBy(focusCapturesTable.sessionId);
  for (const row of rows) map.set(row.sessionId, row.n);
  return map;
}

// Lazy sweep: an open session whose planned time + grace elapsed is closed as
// "expired" on the next read. Credit is the planned time — the likeliest story
// is the user focused and forgot to close, and stats here are private and
// self-relevant, so we err generous rather than police (SDT, §1.7).
async function sweepExpired(userId: string, now: Date): Promise<void> {
  const [active] = await db
    .select()
    .from(focusSessionsTable)
    .where(and(eq(focusSessionsTable.userId, userId), isNull(focusSessionsTable.endedAt)));
  if (!active || !isExpired(active.startedAt, active.plannedMinutes, now)) return;
  await db
    .update(focusSessionsTable)
    .set({
      endedAt: new Date(active.startedAt.getTime() + active.plannedMinutes * 60 * 1000),
      outcome: "expired",
      actualSeconds: active.plannedMinutes * 60,
    })
    .where(eq(focusSessionsTable.id, active.id));
}

router.get("/focus/settings", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const settings = await getOrCreateSettings(userId);
  res.json(settingsToPublic(settings));
});

router.put("/focus/settings", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateFocusSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  await getOrCreateSettings(userId);
  const [updated] = await db
    .update(focusSettingsTable)
    .set(parsed.data)
    .where(eq(focusSettingsTable.userId, userId))
    .returning();
  res.json(settingsToPublic(updated));
});

router.post("/focus/sessions", requireAuth, async (req, res): Promise<void> => {
  const parsed = StartFocusSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const now = new Date();
  await sweepExpired(userId, now);

  const settings = await getOrCreateSettings(userId);
  const intention = parsed.data.intention.trim();
  if (intention.length < 3) {
    res.status(400).json({ error: "An intention is the contract — say what you will do." });
    return;
  }

  let paperTitle: string | null = null;
  if (parsed.data.paperId != null) {
    const [paper] = await db
      .select({ id: papersTable.id, title: papersTable.title })
      .from(papersTable)
      .where(eq(papersTable.id, parsed.data.paperId));
    if (!paper) {
      res.status(400).json({ error: "Paper not found" });
      return;
    }
    paperTitle = paper.title;
  }

  try {
    const [row] = await db
      .insert(focusSessionsTable)
      .values({
        userId,
        paperId: parsed.data.paperId ?? null,
        intention,
        plannedMinutes: clampPlannedMinutes(parsed.data.plannedMinutes ?? settings.defaultMinutes),
        lockMode: parsed.data.lockMode ?? settings.defaultLockMode,
      })
      .returning();
    res.status(201).json(sessionToPublic(row, paperTitle, 0));
  } catch {
    // Partial unique index: one open session per user.
    res.status(409).json({ error: "A focus session is already active — one attention per person." });
  }
});

router.get("/focus/sessions/active", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const now = new Date();
  await sweepExpired(userId, now);
  const settings = await getOrCreateSettings(userId);
  const [active] = await db
    .select()
    .from(focusSessionsTable)
    .where(and(eq(focusSessionsTable.userId, userId), isNull(focusSessionsTable.endedAt)));
  if (!active) {
    res.json({ session: null, remainingSeconds: null, quietFeed: settings.quietFeed });
    return;
  }
  const titles = await paperTitlesByIds(active.paperId != null ? [active.paperId] : []);
  const counts = await captureCountsBySession([active.id]);
  res.json({
    session: sessionToPublic(
      active,
      active.paperId != null ? (titles.get(active.paperId) ?? null) : null,
      counts.get(active.id) ?? 0,
    ),
    remainingSeconds: remainingSeconds(active.startedAt, active.plannedMinutes, now),
    quietFeed: settings.quietFeed,
  });
});

router.get("/focus/sessions", requireAuth, async (req, res): Promise<void> => {
  const query = ListFocusSessionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  await sweepExpired(userId, new Date());
  const limit = Math.min(100, Math.max(1, query.data.limit ?? 20));
  const rows = await db
    .select()
    .from(focusSessionsTable)
    .where(eq(focusSessionsTable.userId, userId))
    .orderBy(desc(focusSessionsTable.startedAt))
    .limit(limit);
  const titles = await paperTitlesByIds(rows.flatMap((r) => (r.paperId != null ? [r.paperId] : [])));
  const counts = await captureCountsBySession(rows.map((r) => r.id));
  res.json(
    rows.map((r) =>
      sessionToPublic(
        r,
        r.paperId != null ? (titles.get(r.paperId) ?? null) : null,
        counts.get(r.id) ?? 0,
      ),
    ),
  );
});

router.post("/focus/sessions/:id/end", requireAuth, async (req, res): Promise<void> => {
  const params = EndFocusSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = EndFocusSessionBody.safeParse(req.body);
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
  if (session.endedAt) {
    res.status(409).json({ error: "Session already ended" });
    return;
  }

  const now = new Date();
  const actual = elapsedSeconds(session.startedAt, now);
  const { action, felt, closingNote, abandonReason } = parsed.data;

  if (requiresAbandonReason(session.lockMode, action, actual, session.plannedMinutes)) {
    const reason = abandonReason?.trim();
    if (!reason) {
      res.status(400).json({
        error:
          "You asked to be held to this one (ulysses mode). One honest line about why you're stopping, and you're free.",
      });
      return;
    }
  }

  const outcome = deriveOutcome(action, actual, session.plannedMinutes);
  const [updated] = await db
    .update(focusSessionsTable)
    .set({
      endedAt: now,
      outcome,
      actualSeconds: actual,
      felt: felt ?? null,
      closingNote: closingNote?.trim() || null,
      abandonReason: abandonReason?.trim() || null,
    })
    .where(eq(focusSessionsTable.id, session.id))
    .returning();

  const captures = await db
    .select()
    .from(focusCapturesTable)
    .where(eq(focusCapturesTable.sessionId, session.id))
    .orderBy(focusCapturesTable.capturedAt);
  const titles = await paperTitlesByIds(session.paperId != null ? [session.paperId] : []);

  res.json({
    session: sessionToPublic(
      updated,
      session.paperId != null ? (titles.get(session.paperId) ?? null) : null,
      captures.length,
    ),
    message: closureMessage(outcome, actual, session.plannedMinutes, captures.length),
    suggestBreakMinutes: suggestBreakMinutes(actual),
    captures,
  });
});

router.post("/focus/sessions/:id/captures", requireAuth, async (req, res): Promise<void> => {
  const params = CreateFocusCaptureParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateFocusCaptureBody.safeParse(req.body);
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
  if (session.endedAt) {
    res.status(409).json({ error: "Session is no longer active" });
    return;
  }
  const [row] = await db
    .insert(focusCapturesTable)
    .values({
      sessionId: session.id,
      userId,
      body: parsed.data.body.trim(),
      kind: parsed.data.kind ?? "thought",
    })
    .returning();
  res.status(201).json(row);
});

router.get("/focus/sessions/:id/captures", requireAuth, async (req, res): Promise<void> => {
  const params = ListFocusCapturesParams.safeParse(req.params);
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
  const rows = await db
    .select()
    .from(focusCapturesTable)
    .where(eq(focusCapturesTable.sessionId, session.id))
    .orderBy(focusCapturesTable.capturedAt);
  res.json(rows);
});

router.post("/focus/captures/:id/resolve", requireAuth, async (req, res): Promise<void> => {
  const params = ResolveFocusCaptureParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = ResolveFocusCaptureBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const [updated] = await db
    .update(focusCapturesTable)
    .set({ resolution: parsed.data.resolution, resolvedAt: new Date() })
    .where(and(eq(focusCapturesTable.id, params.data.id), eq(focusCapturesTable.userId, userId)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Capture not found" });
    return;
  }
  res.json(updated);
});

router.get("/focus/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthedRequest).userId;
  const now = new Date();
  await sweepExpired(userId, now);
  const settings = await getOrCreateSettings(userId);

  const horizon = new Date(now.getTime() - 7 * 26 * 24 * 3600 * 1000);
  const sessions = await db
    .select()
    .from(focusSessionsTable)
    .where(and(eq(focusSessionsTable.userId, userId), gte(focusSessionsTable.startedAt, horizon)));

  const ended = sessions.filter((s) => s.endedAt && s.actualSeconds != null);
  const thisWeek = weekStart(now);
  const inThisWeek = ended.filter((s) => s.endedAt! >= thisWeek);

  const completionWindow = new Date(now.getTime() - COMPLETION_WINDOW_DAYS * 24 * 3600 * 1000);
  // Expired sessions are excluded from the rate: an unknown ending is not a
  // failure, and counting it as one would punish forgetting over quitting.
  const rated = ended.filter((s) => s.endedAt! >= completionWindow && s.outcome !== "expired");
  const finished = rated.filter((s) => s.outcome === "completed" || s.outcome === "overran");

  const [parked] = await db
    .select({ n: count() })
    .from(focusCapturesTable)
    .where(eq(focusCapturesTable.userId, userId));
  const [letGo] = await db
    .select({ n: count() })
    .from(focusCapturesTable)
    .where(and(eq(focusCapturesTable.userId, userId), eq(focusCapturesTable.resolution, "let_go")));

  res.json({
    weekStart: thisWeek,
    minutesThisWeek: Math.round(inThisWeek.reduce((sum, s) => sum + s.actualSeconds!, 0) / 60),
    weeklyTargetMinutes: settings.weeklyTargetMinutes,
    sessionsThisWeek: inThisWeek.length,
    completionRate: rated.length === 0 ? null : finished.length / rated.length,
    medianSessionMinutes: median(ended.map((s) => s.actualSeconds! / 60)),
    weeksActive: weeksActive(ended.map((s) => s.endedAt!), now),
    capturesParked: parked.n,
    capturesLetGo: letGo.n,
  });
});

export default router;
