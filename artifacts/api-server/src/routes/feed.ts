import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  papersTable,
  reviewsTable,
  commentsTable,
} from "@workspace/db";
import { papersToSummaries } from "../lib/paperHelpers";

const router: IRouter = Router();

router.get("/feed/trending", async (_req, res): Promise<void> => {
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14);
  const rows = await db
    .select()
    .from(papersTable)
    .where(sql`${papersTable.updatedAt} > ${since}`)
    .orderBy(desc(papersTable.rigorScore), desc(papersTable.updatedAt))
    .limit(12);
  res.json(await papersToSummaries(rows));
});

router.get("/feed/promoted", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(papersTable)
    .where(eq(papersTable.stage, "promoted"))
    .orderBy(desc(papersTable.updatedAt))
    .limit(12);
  res.json(await papersToSummaries(rows));
});

router.get("/feed/published", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(papersTable)
    .where(eq(papersTable.stage, "published"))
    .orderBy(desc(papersTable.updatedAt))
    .limit(12);
  res.json(await papersToSummaries(rows));
});

router.get("/feed/stats", async (_req, res): Promise<void> => {
  const [stageRows, contributorsRow, reviewsRow] = await Promise.all([
    db
      .select({
        stage: papersTable.stage,
        cnt: sql<number>`count(*)::int`,
      })
      .from(papersTable)
      .groupBy(papersTable.stage),
    db
      .select({
        cnt: sql<number>`count(distinct ${papersTable.authorId})::int`,
      })
      .from(papersTable),
    db.select({ cnt: sql<number>`count(*)::int` }).from(reviewsTable),
  ]);

  let total = 0;
  let underReview = 0;
  let promoted = 0;
  let published = 0;
  for (const r of stageRows) {
    total += r.cnt;
    if (r.stage === "under_review") underReview = r.cnt;
    else if (r.stage === "promoted") promoted = r.cnt;
    else if (r.stage === "published") published = r.cnt;
  }
  res.json({
    totalPapers: total,
    underReview,
    promoted,
    published,
    contributors: contributorsRow[0]?.cnt ?? 0,
    totalReviews: reviewsRow[0]?.cnt ?? 0,
  });
});

router.get("/fields", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      slug: sql<string>`unnest(${papersTable.fields})`,
      cnt: sql<number>`count(*)::int`,
    })
    .from(papersTable)
    .groupBy(sql`unnest(${papersTable.fields})`)
    .orderBy(desc(sql`count(*)`));
  const fields = rows.map((r) => ({
    slug: r.slug,
    name: r.slug
      .split(/[-_\s]+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" "),
    paperCount: r.cnt,
  }));
  res.json(fields);
});

// avoid unused import warning
void commentsTable;

export default router;
