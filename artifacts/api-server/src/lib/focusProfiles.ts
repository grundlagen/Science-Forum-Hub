import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  focusProfilesTable,
  focusSessionsTable,
  type FocusProfile,
} from "@workspace/db";
import { isQualifyingSession } from "./focusGuard";

/** Fetch the user's FocusGuard profile, creating one with defaults on first use. */
export async function getOrCreateFocusProfile(userId: string): Promise<FocusProfile> {
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
  // Lost an insert race; the row now exists.
  const [row] = await db
    .select()
    .from(focusProfilesTable)
    .where(eq(focusProfilesTable.userId, userId));
  return row;
}

export type ReviewFocusBacking = { focusBacked: boolean; focusMinutes: number | null };

const NOT_BACKED: ReviewFocusBacking = { focusBacked: false, focusMinutes: null };

/**
 * For a set of review ids, return which were produced by a qualifying deep
 * focus session and how many focused minutes backed each. Reviews link to a
 * session via `focus_sessions.result_review_id`.
 */
export async function getReviewFocusBacking(
  reviewIds: number[],
): Promise<Map<number, ReviewFocusBacking>> {
  const map = new Map<number, ReviewFocusBacking>();
  for (const id of reviewIds) map.set(id, NOT_BACKED);
  if (reviewIds.length === 0) return map;

  const sessions = await db
    .select()
    .from(focusSessionsTable)
    .where(inArray(focusSessionsTable.resultReviewId, reviewIds));

  for (const s of sessions) {
    if (s.resultReviewId == null) continue;
    if (!isQualifyingSession(s)) continue;
    const minutes = Math.round(s.focusedSeconds / 60);
    const prev = map.get(s.resultReviewId);
    // Keep the strongest backing if multiple sessions link to one review.
    if (!prev?.focusBacked || (prev.focusMinutes ?? 0) < minutes) {
      map.set(s.resultReviewId, { focusBacked: true, focusMinutes: minutes });
    }
  }
  return map;
}

/**
 * When a review is cast, attach the most recent unlinked focus session the user
 * ran on that paper (active, paused, or just-completed) so the verdict carries
 * its attention provenance. Returns the backing for the new review.
 */
export async function linkReviewToFocus(
  userId: string,
  paperId: number,
  reviewId: number,
): Promise<ReviewFocusBacking> {
  const [session] = await db
    .select()
    .from(focusSessionsTable)
    .where(
      and(
        eq(focusSessionsTable.userId, userId),
        eq(focusSessionsTable.paperId, paperId),
        isNull(focusSessionsTable.resultReviewId),
      ),
    )
    .orderBy(desc(focusSessionsTable.startedAt))
    .limit(1);

  if (!session) return NOT_BACKED;

  await db
    .update(focusSessionsTable)
    .set({ resultReviewId: reviewId })
    .where(eq(focusSessionsTable.id, session.id));

  if (!isQualifyingSession(session)) return NOT_BACKED;
  return { focusBacked: true, focusMinutes: Math.round(session.focusedSeconds / 60) };
}
