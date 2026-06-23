import { eq, and } from "drizzle-orm";
import {
  db,
  papersTable,
  reviewsTable,
  commentsTable,
  focusAnchorsTable,
  focusSignalsTable,
  type FocusAnchorRow,
  type FocusSignalRow,
} from "@workspace/db";
import {
  deriveAnchor,
  evaluate,
  aggregateHealth,
  type FocusAnchor,
  type FocusReport,
  type FocusHealth,
  type Contribution,
} from "@workspace/focus-guard";

/**
 * Bridges persisted papers/reviews/comments to the @workspace/focus-guard
 * engine. The engine stays pure; all I/O lives here. The `generatedBy` tag
 * lets us re-evaluate stale rows when the engine version changes.
 */
export const FOCUS_ENGINE_VERSION = "heuristic-v1";

function rowToAnchor(row: FocusAnchorRow): FocusAnchor {
  return {
    centralClaim: row.centralClaim,
    keyTerms: row.keyTerms,
    inScope: row.inScope,
    outScope: row.outScope,
    claimType: row.claimType,
  };
}

/**
 * Return the paper's focus anchor, deriving and persisting one on first use.
 * One anchor per paper (enforced by a unique index); call {@link refreshAnchor}
 * after a major revision to regenerate it.
 */
export async function ensureAnchor(paperId: number): Promise<FocusAnchor> {
  const [existing] = await db
    .select()
    .from(focusAnchorsTable)
    .where(eq(focusAnchorsTable.paperId, paperId));
  if (existing) return rowToAnchor(existing);
  return refreshAnchor(paperId);
}

/** (Re)derive the anchor from the current paper and upsert it. */
export async function refreshAnchor(paperId: number): Promise<FocusAnchor> {
  const [paper] = await db
    .select()
    .from(papersTable)
    .where(eq(papersTable.id, paperId));
  if (!paper) throw new Error("paper not found");

  const anchor = deriveAnchor({
    title: paper.title,
    abstract: paper.abstract,
    body: paper.body,
    fields: paper.fields,
  });

  await db
    .insert(focusAnchorsTable)
    .values({
      paperId,
      centralClaim: anchor.centralClaim,
      keyTerms: anchor.keyTerms,
      inScope: anchor.inScope,
      outScope: anchor.outScope,
      claimType: anchor.claimType,
      generatedBy: FOCUS_ENGINE_VERSION,
    })
    .onConflictDoUpdate({
      target: focusAnchorsTable.paperId,
      set: {
        centralClaim: anchor.centralClaim,
        keyTerms: anchor.keyTerms,
        inScope: anchor.inScope,
        outScope: anchor.outScope,
        claimType: anchor.claimType,
        generatedBy: FOCUS_ENGINE_VERSION,
      },
    });

  return anchor;
}

/** Evaluate one contribution and persist the result (idempotent per target). */
export async function guardContribution(
  paperId: number,
  kind: Contribution["kind"],
  targetId: number,
  text: string,
  stance?: Contribution["stance"],
): Promise<FocusReport> {
  const anchor = await ensureAnchor(paperId);
  const report = evaluate({ kind, text, stance }, anchor);

  await db
    .insert(focusSignalsTable)
    .values({
      paperId,
      targetKind: kind,
      targetId,
      driftScore: report.driftScore,
      engagementScore: report.engagementScore,
      verdict: report.verdict,
      interventionLevel: report.interventionLevel,
      signals: report.signals,
      nudge: report.nudge,
      generatedBy: FOCUS_ENGINE_VERSION,
    })
    .onConflictDoUpdate({
      target: [focusSignalsTable.targetKind, focusSignalsTable.targetId],
      set: {
        driftScore: report.driftScore,
        engagementScore: report.engagementScore,
        verdict: report.verdict,
        interventionLevel: report.interventionLevel,
        signals: report.signals,
        nudge: report.nudge,
        generatedBy: FOCUS_ENGINE_VERSION,
      },
    });

  return report;
}

/** Guard a review by id, reading its stance + justification. */
export async function guardReview(reviewId: number): Promise<FocusReport> {
  const [review] = await db
    .select()
    .from(reviewsTable)
    .where(eq(reviewsTable.id, reviewId));
  if (!review) throw new Error("review not found");
  return guardContribution(
    review.paperId,
    "review",
    review.id,
    review.justification,
    review.stance,
  );
}

/** Guard a comment by id. */
export async function guardComment(commentId: number): Promise<FocusReport> {
  const [comment] = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.id, commentId));
  if (!comment) throw new Error("comment not found");
  return guardContribution(
    comment.paperId,
    "comment",
    comment.id,
    comment.body,
  );
}

function rowToReport(row: FocusSignalRow): FocusReport {
  return {
    driftScore: row.driftScore,
    onFocus: row.verdict === "on_focus",
    verdict: row.verdict,
    engagementScore: row.engagementScore,
    signals: row.signals as FocusReport["signals"],
    interventionLevel: row.interventionLevel,
    nudge: (row.nudge as FocusReport["nudge"]) ?? null,
    summary: "",
  };
}

/** Aggregate stored signals for a paper into a thread-health snapshot. */
export async function getThreadHealth(paperId: number): Promise<FocusHealth> {
  const rows = await db
    .select()
    .from(focusSignalsTable)
    .where(eq(focusSignalsTable.paperId, paperId));
  return aggregateHealth(rows.map(rowToReport));
}

export { and };
