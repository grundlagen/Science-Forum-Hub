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
import { getReviewFocusBacking, linkReviewToFocus } from "../lib/focusProfiles";

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
  const backing = await getReviewFocusBacking(rows.map((r) => r.id));
  res.json(
    rows.map((r) => {
      const b = backing.get(r.id)!;
      return {
        id: r.id,
        paperId: r.paperId,
        author: profileToPublic(profiles.get(r.authorId)!),
        stance: r.stance,
        justification: r.justification,
        createdAt: r.createdAt,
        focusBacked: b.focusBacked,
        focusMinutes: b.focusMinutes,
      };
    }),
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

  const [existing] = await db
    .select()
    .from(reviewsTable)
    .where(and(eq(reviewsTable.paperId, params.data.id), eq(reviewsTable.authorId, userId)));

  let row;
  if (existing) {
    [row] = await db
      .update(reviewsTable)
      .set({ stance: parsed.data.stance, justification: parsed.data.justification })
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
      })
      .returning();
  }

  await recomputeStage(params.data.id);
  // Attach attention provenance: if the reviewer ran a deep focus session on
  // this paper, this verdict inherits its "deep review" badge.
  const backing = await linkReviewToFocus(userId, params.data.id, row.id);
  const author = await getOrCreateProfile(userId);
  res.status(201).json({
    id: row.id,
    paperId: row.paperId,
    author: profileToPublic(author),
    stance: row.stance,
    justification: row.justification,
    createdAt: row.createdAt,
    focusBacked: backing.focusBacked,
    focusMinutes: backing.focusMinutes,
  });
});

export default router;
