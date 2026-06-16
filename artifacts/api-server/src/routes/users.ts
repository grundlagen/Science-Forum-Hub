import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, papersTable, reviewsTable, commentsTable } from "@workspace/db";
import { GetUserProfileParams } from "@workspace/api-zod";
import { getUserId } from "../lib/auth";
import { getOrCreateProfile, getProfilesByIds, profileToPublic } from "../lib/profiles";
import { papersToSummaries } from "../lib/paperHelpers";
import { getReviewFocusBacking } from "../lib/focusProfiles";

const router: IRouter = Router();

router.get("/me", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.json({ user: null });
    return;
  }
  const profile = await getOrCreateProfile(userId);
  res.json({ user: profileToPublic(profile) });
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const params = GetUserProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const profile = await getOrCreateProfile(params.data.id);

  const papers = await db
    .select()
    .from(papersTable)
    .where(eq(papersTable.authorId, params.data.id))
    .orderBy(desc(papersTable.createdAt));

  const reviewRows = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.authorId, params.data.id))
    .orderBy(desc(reviewsTable.createdAt))
    .limit(50);
  const reviewerProfiles = await getProfilesByIds(reviewRows.map((r) => r.authorId));
  const reviewBacking = await getReviewFocusBacking(reviewRows.map((r) => r.id));

  const [{ cnt: commentsCnt }] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(commentsTable)
    .where(eq(commentsTable.authorId, params.data.id));

  const summaries = await papersToSummaries(papers);
  const publishedCount = papers.filter((p) => p.stage === "published").length;

  res.json({
    user: profileToPublic(profile),
    papers: summaries,
    reviews: reviewRows.map((r) => {
      const b = reviewBacking.get(r.id)!;
      return {
        id: r.id,
        paperId: r.paperId,
        author: profileToPublic(reviewerProfiles.get(r.authorId)!),
        stance: r.stance,
        justification: r.justification,
        createdAt: r.createdAt,
        focusBacked: b.focusBacked,
        focusMinutes: b.focusMinutes,
      };
    }),
    stats: {
      papersSubmitted: papers.length,
      papersPublished: publishedCount,
      reviewsCast: reviewRows.length,
      commentsPosted: commentsCnt,
    },
  });
});

export default router;
