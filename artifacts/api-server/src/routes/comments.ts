import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, commentsTable, papersTable } from "@workspace/db";
import {
  ListPaperCommentsParams,
  CreatePaperCommentParams,
  CreatePaperCommentBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { getOrCreateProfile, getProfilesByIds, profileToPublic } from "../lib/profiles";

const router: IRouter = Router();

router.get("/papers/:id/comments", async (req, res): Promise<void> => {
  const params = ListPaperCommentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.paperId, params.data.id))
    .orderBy(asc(commentsTable.createdAt));
  const profiles = await getProfilesByIds(rows.map((r) => r.authorId));
  res.json(
    rows.map((r) => ({
      id: r.id,
      paperId: r.paperId,
      parentId: r.parentId,
      author: profileToPublic(profiles.get(r.authorId)!),
      body: r.body,
      createdAt: r.createdAt,
    })),
  );
});

router.post("/papers/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const params = CreatePaperCommentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreatePaperCommentBody.safeParse(req.body);
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
  await getOrCreateProfile(userId);

  const [row] = await db
    .insert(commentsTable)
    .values({
      paperId: params.data.id,
      authorId: userId,
      parentId: parsed.data.parentId ?? null,
      body: parsed.data.body,
    })
    .returning();

  const author = await getOrCreateProfile(userId);
  res.status(201).json({
    id: row.id,
    paperId: row.paperId,
    parentId: row.parentId,
    author: profileToPublic(author),
    body: row.body,
    createdAt: row.createdAt,
  });
});

export default router;
