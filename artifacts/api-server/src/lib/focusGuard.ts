/**
 * Focus Guard glue: translate database rows into the API shape and bridge to
 * the pure `@workspace/focus-engine`. All psychology lives in the engine; this
 * file only moves data across the boundary.
 */

import { eq } from "drizzle-orm";
import {
  db,
  focusPreferencesTable,
  type FocusSession,
  type FocusEvent,
  type FocusPreferences,
} from "@workspace/db";

/** Local calendar day (YYYY-MM-DD) for a timestamp in a given UTC-offset. */
export function localDay(date: Date, utcOffsetMinutes = 0): string {
  const shifted = new Date(date.getTime() + utcOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function serializeSession(row: FocusSession) {
  return {
    id: row.id,
    intention: row.intention,
    intentionScore: row.intentionScore,
    intentionOutcome: row.intentionOutcome,
    mode: row.mode,
    technique: row.technique,
    targetPaperId: row.targetPaperId,
    plannedMinutes: row.plannedMinutes,
    focusedMinutes: row.focusedMinutes,
    state: row.state,
    energyBefore: row.energyBefore,
    energyAfter: row.energyAfter,
    flowRating: row.flowRating,
    distractionCount: row.distractionCount,
    parkedThoughtCount: row.parkedThoughtCount,
    focusScore: row.focusScore,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
  };
}

export function serializeEvent(row: FocusEvent) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    kind: row.kind,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export function serializePreferences(row: FocusPreferences) {
  return {
    defaultTechnique: row.defaultTechnique,
    defaultMode: row.defaultMode,
    guardLevel: row.guardLevel,
    chronotype: row.chronotype,
    dailyGoalMinutes: row.dailyGoalMinutes,
    muteNotifications: row.muteNotifications,
  };
}

/** Read a user's preferences, creating row-defaults on first access. */
export async function getOrCreatePreferences(userId: string): Promise<FocusPreferences> {
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
  // Lost an insert race — read the winner.
  const [row] = await db
    .select()
    .from(focusPreferencesTable)
    .where(eq(focusPreferencesTable.userId, userId));
  return row;
}

/** Which engine event kinds count as interruptions, and how we tally them. */
export function isDistraction(kind: FocusEvent["kind"]): boolean {
  return kind === "distraction";
}
export function isParkedThought(kind: FocusEvent["kind"]): boolean {
  return kind === "parked_thought";
}
