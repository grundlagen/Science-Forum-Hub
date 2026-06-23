import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  integer,
  doublePrecision,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Focus Guard persistence.
 *
 * Two tables mirror the @workspace/focus-guard engine shapes (kept as local
 * JSON types so the db package stays dependency-free, exactly like ai_reports):
 *
 *  - focus_anchors: one epistemic anchor per paper (its central claim + key
 *    constructs). Refreshed on major revision.
 *  - focus_signals: one stored evaluation per contribution (review/comment),
 *    so thread health can be aggregated without re-running the engine.
 */

export type FocusClaimType =
  | "empirical"
  | "theoretical"
  | "methodological"
  | "review"
  | "other";

export type FocusContributionKind = "review" | "comment";

export type FocusVerdict =
  | "on_focus"
  | "minor_drift"
  | "significant_drift"
  | "off_focus";

export type FocusInterventionLevel = "none" | "inform" | "nudge" | "reframe";

export type FocusSignalJson = {
  code: string;
  family: string;
  severity: number;
  confidence: number;
  evidence: string[];
};

export type FocusNudgeJson = {
  level: FocusInterventionLevel;
  message: string;
  rationaleCode: string;
  citations: string[];
};

export const focusAnchorsTable = pgTable(
  "focus_anchors",
  {
    id: serial("id").primaryKey(),
    paperId: integer("paper_id").notNull(),
    centralClaim: text("central_claim").notNull(),
    keyTerms: text("key_terms").array().notNull().default([]),
    inScope: text("in_scope").array().notNull().default([]),
    outScope: text("out_scope").array().notNull().default([]),
    claimType: text("claim_type")
      .$type<FocusClaimType>()
      .notNull()
      .default("other"),
    /** How the anchor was produced, e.g. "heuristic-v1" or a model id. */
    generatedBy: text("generated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    paperUnique: uniqueIndex("focus_anchors_paper_unique").on(t.paperId),
  }),
);

export const focusSignalsTable = pgTable(
  "focus_signals",
  {
    id: serial("id").primaryKey(),
    paperId: integer("paper_id").notNull(),
    targetKind: text("target_kind").$type<FocusContributionKind>().notNull(),
    targetId: integer("target_id").notNull(),
    driftScore: doublePrecision("drift_score").notNull(),
    engagementScore: doublePrecision("engagement_score").notNull(),
    verdict: text("verdict").$type<FocusVerdict>().notNull(),
    interventionLevel: text("intervention_level")
      .$type<FocusInterventionLevel>()
      .notNull(),
    signals: jsonb("signals").$type<FocusSignalJson[]>().notNull().default([]),
    nudge: jsonb("nudge").$type<FocusNudgeJson | null>(),
    /** Engine/model identifier that produced this evaluation. */
    generatedBy: text("generated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    targetUnique: uniqueIndex("focus_signals_target_unique").on(
      t.targetKind,
      t.targetId,
    ),
  }),
);

export type FocusAnchorRow = typeof focusAnchorsTable.$inferSelect;
export type InsertFocusAnchor = typeof focusAnchorsTable.$inferInsert;
export type FocusSignalRow = typeof focusSignalsTable.$inferSelect;
export type InsertFocusSignal = typeof focusSignalsTable.$inferInsert;
