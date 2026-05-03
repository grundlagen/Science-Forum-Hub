import { Router, type IRouter } from "express";
import { eq, desc, asc, and, sql, ilike, or } from "drizzle-orm";
import {
  db,
  papersTable,
  paperRevisionsTable,
  aiReportsTable,
  type Paper,
} from "@workspace/db";
import {
  CreatePaperBody,
  UpdatePaperBody,
  GetPaperParams,
  UpdatePaperParams,
  ListPapersQueryParams,
  ListPaperRevisionsParams,
  RerunPaperAiParams,
} from "@workspace/api-zod";
import { requireAuth, getUserId, type AuthedRequest } from "../lib/auth";
import {
  buildVoteBreakdown,
  getCountsForPapers,
  getLatestAiReport,
  papersToSummaries,
  recomputeStage,
  PROMOTION_THRESHOLDS,
} from "../lib/paperHelpers";
import { getOrCreateProfile, profileToPublic } from "../lib/profiles";
import { generateAiBundle, AI_MODEL } from "../lib/ai";

const router: IRouter = Router();

router.get("/papers", async (req, res): Promise<void> => {
  const parsed = ListPapersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { stage, field, q, sort, authorId, limit } = parsed.data;
  const conds = [];
  if (stage && stage !== "all") conds.push(eq(papersTable.stage, stage));
  if (authorId) conds.push(eq(papersTable.authorId, authorId));
  if (field) conds.push(sql`${field} = ANY(${papersTable.fields})`);
  if (q && q.length > 0) {
    const like = `%${q}%`;
    conds.push(or(ilike(papersTable.title, like), ilike(papersTable.abstract, like))!);
  }
  const where = conds.length > 0 ? and(...conds) : undefined;
  const orderBy =
    sort === "trending"
      ? [desc(papersTable.updatedAt)]
      : sort === "top"
        ? [desc(papersTable.rigorScore), desc(papersTable.createdAt)]
        : [desc(papersTable.createdAt)];

  const cap = Math.min(limit ?? 50, 200);
  const rows = await db
    .select()
    .from(papersTable)
    .where(where)
    .orderBy(...orderBy)
    .limit(cap);

  const summaries = await papersToSummaries(rows);
  res.json(summaries);
});

router.post("/papers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePaperBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  await getOrCreateProfile(userId);

  const [created] = await db
    .insert(papersTable)
    .values({
      authorId: userId,
      title: parsed.data.title,
      abstract: parsed.data.abstract,
      body: parsed.data.body,
      fields: parsed.data.fields,
      references: parsed.data.references,
      stage: "draft",
    })
    .returning();

  res.status(201).json(created);

  // Fire-and-forget AI generation
  void (async () => {
    try {
      const bundle = await generateAiBundle({
        title: created.title,
        abstract: created.abstract,
        body: created.body,
        fields: created.fields,
        references: created.references,
      });
      await db.insert(aiReportsTable).values({
        paperId: created.id,
        revisionNumber: 0,
        rigor: bundle.rigor,
        survey: bundle.survey,
        rigorScore: bundle.rigor.overallScore,
        surveyConfidence: bundle.survey.confidence,
        model: AI_MODEL,
      });
      await db
        .update(papersTable)
        .set({
          rigorScore: bundle.rigor.overallScore,
          aiConfidence: bundle.survey.confidence,
        })
        .where(eq(papersTable.id, created.id));
      await recomputeStage(created.id);
    } catch (err) {
      req.log.error({ err, paperId: created.id }, "background AI generation failed");
    }
  })();
});

router.get("/papers/:id", async (req, res): Promise<void> => {
  const params = GetPaperParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [paper] = await db.select().from(papersTable).where(eq(papersTable.id, params.data.id));
  if (!paper) {
    res.status(404).json({ error: "Paper not found" });
    return;
  }
  const counts = (await getCountsForPapers([paper.id])).get(paper.id)!;
  const author = await getOrCreateProfile(paper.authorId);
  const aiReport = await getLatestAiReport(paper.id);
  res.json({
    paper,
    author: profileToPublic(author),
    rigorReport: aiReport
      ? { ...aiReport.rigor, createdAt: aiReport.createdAt }
      : null,
    aiSurvey: aiReport
      ? { ...aiReport.survey, createdAt: aiReport.createdAt }
      : null,
    voteBreakdown: buildVoteBreakdown(counts, paper),
    commentCount: counts.comments,
    promotionThresholds: PROMOTION_THRESHOLDS,
  });
});

router.patch("/papers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdatePaperParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePaperBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const [existing] = await db.select().from(papersTable).where(eq(papersTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Paper not found" });
    return;
  }
  if (existing.authorId !== userId) {
    res.status(403).json({ error: "Only the author can revise this paper" });
    return;
  }

  const newRevisionNumber = existing.revisionCount + 1;
  await db.insert(paperRevisionsTable).values({
    paperId: existing.id,
    revisionNumber: newRevisionNumber,
    title: existing.title,
    abstract: existing.abstract,
    summary: parsed.data.revisionSummary,
  });

  const [updated] = await db
    .update(papersTable)
    .set({
      title: parsed.data.title,
      abstract: parsed.data.abstract,
      body: parsed.data.body,
      fields: parsed.data.fields,
      references: parsed.data.references,
      revisionCount: newRevisionNumber,
    })
    .where(eq(papersTable.id, existing.id))
    .returning();

  res.json(updated);

  void (async () => {
    try {
      const bundle = await generateAiBundle({
        title: updated.title,
        abstract: updated.abstract,
        body: updated.body,
        fields: updated.fields,
        references: updated.references,
      });
      await db.insert(aiReportsTable).values({
        paperId: updated.id,
        revisionNumber: newRevisionNumber,
        rigor: bundle.rigor,
        survey: bundle.survey,
        rigorScore: bundle.rigor.overallScore,
        surveyConfidence: bundle.survey.confidence,
        model: AI_MODEL,
      });
      await db
        .update(papersTable)
        .set({
          rigorScore: bundle.rigor.overallScore,
          aiConfidence: bundle.survey.confidence,
        })
        .where(eq(papersTable.id, updated.id));
      await recomputeStage(updated.id);
    } catch (err) {
      req.log.error({ err, paperId: updated.id }, "background AI rerun failed");
    }
  })();
});

router.get("/papers/:id/revisions", async (req, res): Promise<void> => {
  const params = ListPaperRevisionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(paperRevisionsTable)
    .where(eq(paperRevisionsTable.paperId, params.data.id))
    .orderBy(asc(paperRevisionsTable.revisionNumber));
  res.json(rows);
});

router.post("/papers/:id/rerun-ai", requireAuth, async (req, res): Promise<void> => {
  const params = RerunPaperAiParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = (req as AuthedRequest).userId;
  const [paper] = await db.select().from(papersTable).where(eq(papersTable.id, params.data.id));
  if (!paper) {
    res.status(404).json({ error: "Paper not found" });
    return;
  }
  if (paper.authorId !== userId) {
    res.status(403).json({ error: "Only the author can re-run AI analysis" });
    return;
  }

  const bundle = await generateAiBundle({
    title: paper.title,
    abstract: paper.abstract,
    body: paper.body,
    fields: paper.fields,
    references: paper.references,
  });
  await db.insert(aiReportsTable).values({
    paperId: paper.id,
    revisionNumber: paper.revisionCount,
    rigor: bundle.rigor,
    survey: bundle.survey,
    rigorScore: bundle.rigor.overallScore,
    surveyConfidence: bundle.survey.confidence,
    model: AI_MODEL,
  });
  await db
    .update(papersTable)
    .set({
      rigorScore: bundle.rigor.overallScore,
      aiConfidence: bundle.survey.confidence,
    })
    .where(eq(papersTable.id, paper.id));
  const updated = await recomputeStage(paper.id);
  const counts = (await getCountsForPapers([updated.id])).get(updated.id)!;
  const author = await getOrCreateProfile(updated.authorId);
  const aiReport = await getLatestAiReport(updated.id);
  res.json({
    paper: updated,
    author: profileToPublic(author),
    rigorReport: aiReport ? { ...aiReport.rigor, createdAt: aiReport.createdAt } : null,
    aiSurvey: aiReport ? { ...aiReport.survey, createdAt: aiReport.createdAt } : null,
    voteBreakdown: buildVoteBreakdown(counts, updated),
    commentCount: counts.comments,
    promotionThresholds: PROMOTION_THRESHOLDS,
  });
});

export default router;
