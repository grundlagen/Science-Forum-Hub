import { Router, type IRouter } from "express";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import {
  endSession,
  getGuardState,
  getOrCreateGuardProfile,
  heartbeat,
  recordBreak,
  startSession,
  updateGuardSettings,
  type GuardSettingsPatch,
  type HeartbeatPatch,
} from "../lib/focusGuardService";
import type { FocusIntent } from "@workspace/db";

const router: IRouter = Router();

// --- tiny, dependency-free validation helpers ------------------------------

const INTENTS: FocusIntent[] = ["read", "review", "skim"];

function asIntent(v: unknown): FocusIntent {
  return typeof v === "string" && (INTENTS as string[]).includes(v)
    ? (v as FocusIntent)
    : "read";
}
function asInt(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}
function asFraction(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function asBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}
function uid(req: import("express").Request): string {
  return (req as AuthedRequest).userId;
}

// --- guard profile / settings ----------------------------------------------

router.get("/focus/me", requireAuth, async (req, res): Promise<void> => {
  const profile = await getOrCreateGuardProfile(uid(req));
  res.json(profile);
});

router.patch("/focus/me/settings", requireAuth, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: GuardSettingsPatch = {};
  if (body.enforcementEnabled !== undefined) patch.enforcementEnabled = asBool(body.enforcementEnabled);
  if (body.ultradianRemindersEnabled !== undefined)
    patch.ultradianRemindersEnabled = asBool(body.ultradianRemindersEnabled);
  if (body.fatigueGuardEnabled !== undefined)
    patch.fatigueGuardEnabled = asBool(body.fatigueGuardEnabled);
  if (body.minReviewEngagementSec !== undefined) {
    const n = asInt(body.minReviewEngagementSec);
    if (n !== undefined) patch.minReviewEngagementSec = Math.min(3600, Math.max(0, n));
  }
  if (body.dailyFocusGoalMin !== undefined) {
    const n = asInt(body.dailyFocusGoalMin);
    if (n !== undefined) patch.dailyFocusGoalMin = Math.min(1440, Math.max(0, n));
  }
  const profile = await updateGuardSettings(uid(req), patch);
  res.json(profile);
});

router.post("/focus/break", requireAuth, async (req, res): Promise<void> => {
  const profile = await recordBreak(uid(req));
  res.json(profile);
});

// --- sessions ---------------------------------------------------------------

router.post("/focus/sessions", requireAuth, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const paperId = asInt(body.paperId);
  const session = await startSession(uid(req), paperId ?? null, asIntent(body.intent));
  res.status(201).json(session);
});

router.patch("/focus/sessions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = asInt(req.params.id);
  if (id === undefined) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const patch: HeartbeatPatch = {
    activeMs: asInt(body.activeMs),
    idleMs: asInt(body.idleMs),
    scrollDepth: asFraction(body.scrollDepth),
    distractionEvents: asInt(body.distractionEvents),
    breaksTaken: asInt(body.breaksTaken),
  };
  const session = await heartbeat(id, uid(req), patch);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(session);
});

router.post("/focus/sessions/:id/end", requireAuth, async (req, res): Promise<void> => {
  const id = asInt(req.params.id);
  if (id === undefined) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const state = body.abandoned === true ? "abandoned" : "completed";
  const result = await endSession(id, uid(req), state);
  if (!result) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ session: result.session, breakdown: result.breakdown });
});

// --- the guard: can / should this user review this paper now? ---------------

router.get("/focus/guard/:paperId", requireAuth, async (req, res): Promise<void> => {
  const paperId = asInt(req.params.paperId);
  if (paperId === undefined) {
    res.status(400).json({ error: "Invalid paper id" });
    return;
  }
  const state = await getGuardState(uid(req), paperId);
  res.json({
    fatigue: state.fatigue,
    eligibility: state.eligibility,
    nudge: state.nudge,
    focusScore: state.focusScore,
    settings: {
      enforcementEnabled: state.profile.enforcementEnabled,
      minReviewEngagementSec: state.profile.minReviewEngagementSec,
      ultradianRemindersEnabled: state.profile.ultradianRemindersEnabled,
      fatigueGuardEnabled: state.profile.fatigueGuardEnabled,
    },
  });
});

export default router;
