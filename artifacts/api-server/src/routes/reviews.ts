import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, reviewsTable, papersTable } from "@workspace/db";
import {
  ListPaperReviewsParams,
  CastPaperReviewParams,
  CastPaperReviewBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { getOrCreateProfile, getProfilesByIds, profileToPublic } from "../lib/profiles";
import { recomputeStage } from "../lib/paperHelpers";
import { getGuardState, noteReviewCast } from "../lib/focusGuardService";

const router: IRouter = Router();

router.get("/papers/:id/reviews", async (req, res): Promise<void> => {
  const params = ListPaperReviewsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.paperId, params.data.id))
    .orderBy(desc(reviewsTable.createdAt));
  const profiles = await getProfilesByIds(rows.map((r) => r.authorId));
  res.json(
    rows.map((r) => ({
      id: r.id,
      paperId: r.paperId,
      author: profileToPublic(profiles.get(r.authorId)!),
      stance: r.stance,
      justification: r.justification,
      createdAt: r.createdAt,
    })),
  );
});

router.post("/papers/:id/reviews", requireAuth, async (req, res): Promise<void> => {
  const params = CastPaperReviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CastPaperReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const [paper] = await db.select().from(papersTable).where(eq(papersTable.id, params.data.id));
  if (!paper) {
    res.status(404).json({ error: "Paper not found" });
    return;
  }
  if (paper.authorId === userId) {
    res.status(400).json({ error: "Authors cannot vote on their own paper" });
    return;
  }
  await getOrCreateProfile(userId);

  // Focus Guard: weigh (and, when the user has opted in, gate) this judgement by
  // the attention that backed it.
  const guard = await getGuardState(userId, params.data.id);
  if (guard.eligibility.blocking) {
    res.status(409).json({
      error: guard.eligibility.message,
      focusGuard: { eligibility: guard.eligibility, fatigue: guard.fatigue },
    });
    return;
  }

  const [existing] = await db
    .select()
    .from(reviewsTable)
    .where(and(eq(reviewsTable.paperId, params.data.id), eq(reviewsTable.authorId, userId)));

  let row;
  if (existing) {
    [row] = await db
      .update(reviewsTable)
      .set({
        stance: parsed.data.stance,
        justification: parsed.data.justification,
        focusScore: guard.focusScore,
      })
      .where(eq(reviewsTable.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(reviewsTable)
      .values({
        paperId: params.data.id,
        authorId: userId,
        stance: parsed.data.stance,
        justification: parsed.data.justification,
        focusScore: guard.focusScore,
      })
      .returning();
    // Only a *new* review advances the decision-fatigue counter; edits don't.
    await noteReviewCast(userId);
  }

  await recomputeStage(params.data.id);
  const author = await getOrCreateProfile(userId);
  res.status(201).json({
    id: row.id,
    paperId: row.paperId,
    author: profileToPublic(author),
    stance: row.stance,
    justification: row.justification,
    focusScore: row.focusScore,
    createdAt: row.createdAt,
    // Advisory even when not blocking, so the UI can reflect on the judgement.
    focusGuard: { eligibility: guard.eligibility, fatigue: guard.fatigue },
  });
});

export default router;
