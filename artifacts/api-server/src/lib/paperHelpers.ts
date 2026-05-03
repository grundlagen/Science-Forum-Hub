import { eq, desc, sql, and, inArray } from "drizzle-orm";
import {
  db,
  papersTable,
  reviewsTable,
  commentsTable,
  aiReportsTable,
  type Paper,
} from "@workspace/db";
import { getProfilesByIds, profileToPublic } from "./profiles";
import { combinedScore, communityScore, computeStage, PROMOTION_THRESHOLDS } from "./promotion";

export type Counts = { endorse: number; challenge: number; reject: number; comments: number };

export async function getCountsForPapers(paperIds: number[]): Promise<Map<number, Counts>> {
  const map = new Map<number, Counts>();
  if (paperIds.length === 0) return map;

  const reviewRows = await db
    .select({
      paperId: reviewsTable.paperId,
      stance: reviewsTable.stance,
      cnt: sql<number>`count(*)::int`,
    })
    .from(reviewsTable)
    .where(inArray(reviewsTable.paperId, paperIds))
    .groupBy(reviewsTable.paperId, reviewsTable.stance);

  const commentRows = await db
    .select({
      paperId: commentsTable.paperId,
      cnt: sql<number>`count(*)::int`,
    })
    .from(commentsTable)
    .where(inArray(commentsTable.paperId, paperIds))
    .groupBy(commentsTable.paperId);

  for (const id of paperIds) {
    map.set(id, { endorse: 0, challenge: 0, reject: 0, comments: 0 });
  }
  for (const r of reviewRows) {
    const c = map.get(r.paperId)!;
    if (r.stance === "endorse") c.endorse = r.cnt;
    else if (r.stance === "challenge") c.challenge = r.cnt;
    else if (r.stance === "reject") c.reject = r.cnt;
  }
  for (const r of commentRows) {
    const c = map.get(r.paperId)!;
    c.comments = r.cnt;
  }
  return map;
}

export async function paperToSummary(paper: Paper, counts?: Counts) {
  const c = counts ?? (await getCountsForPapers([paper.id])).get(paper.id)!;
  const profileMap = await getProfilesByIds([paper.authorId]);
  return {
    id: paper.id,
    title: paper.title,
    abstract: paper.abstract,
    fields: paper.fields,
    stage: paper.stage,
    author: profileToPublic(profileMap.get(paper.authorId)!),
    rigorScore: paper.rigorScore,
    aiConfidence: paper.aiConfidence,
    endorseCount: c.endorse,
    challengeCount: c.challenge,
    rejectCount: c.reject,
    commentCount: c.comments,
    createdAt: paper.createdAt,
    updatedAt: paper.updatedAt,
  };
}

export async function papersToSummaries(papers: Paper[]) {
  const counts = await getCountsForPapers(papers.map((p) => p.id));
  const profiles = await getProfilesByIds(papers.map((p) => p.authorId));
  return papers.map((p) => {
    const c = counts.get(p.id)!;
    return {
      id: p.id,
      title: p.title,
      abstract: p.abstract,
      fields: p.fields,
      stage: p.stage,
      author: profileToPublic(profiles.get(p.authorId)!),
      rigorScore: p.rigorScore,
      aiConfidence: p.aiConfidence,
      endorseCount: c.endorse,
      challengeCount: c.challenge,
      rejectCount: c.reject,
      commentCount: c.comments,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  });
}

export async function recomputeStage(paperId: number): Promise<Paper> {
  const [paper] = await db.select().from(papersTable).where(eq(papersTable.id, paperId));
  if (!paper) throw new Error("paper not found");
  const counts = (await getCountsForPapers([paperId])).get(paperId)!;
  const newStage = computeStage({
    rigorScore: paper.rigorScore,
    aiConfidence: paper.aiConfidence,
    endorse: counts.endorse,
    challenge: counts.challenge,
    reject: counts.reject,
  });
  if (newStage !== paper.stage) {
    const [updated] = await db
      .update(papersTable)
      .set({ stage: newStage })
      .where(eq(papersTable.id, paperId))
      .returning();
    return updated;
  }
  return paper;
}

export async function getLatestAiReport(paperId: number) {
  const [row] = await db
    .select()
    .from(aiReportsTable)
    .where(eq(aiReportsTable.paperId, paperId))
    .orderBy(desc(aiReportsTable.createdAt))
    .limit(1);
  return row ?? null;
}

export function buildVoteBreakdown(counts: Counts, paper: Paper) {
  const community = communityScore(counts.endorse, counts.challenge, counts.reject);
  const total = counts.endorse + counts.challenge + counts.reject;
  const combined = combinedScore(paper.rigorScore, paper.aiConfidence, community, total);
  return {
    endorse: counts.endorse,
    challenge: counts.challenge,
    reject: counts.reject,
    communityScore: Math.round(community * 100) / 100,
    combinedScore: Math.round(combined * 100) / 100,
  };
}

export { PROMOTION_THRESHOLDS };
export { and };
