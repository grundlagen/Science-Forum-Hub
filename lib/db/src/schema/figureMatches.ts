import {
  pgTable,
  serial,
  integer,
  text,
  doublePrecision,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/** The forensic class of a flagged pair. See docs/DUPLICATION_DETECTION_ONESHOT.md §2. */
export type MatchClass = "near_dup" | "copy_move" | "transformed" | "splice";

/**
 * Review status. Only a human reviewer may move a match off "unreviewed".
 * The system never sets "confirmed"/"dismissed"/"benign_explained".
 */
export type MatchStatus = "unreviewed" | "confirmed" | "dismissed" | "benign_explained";

/** A bounding box on a figure, in pixel coordinates. */
export type RegionBox = { x: number; y: number; w: number; h: number };

/** Recovered geometric transform relating region B to region A. */
export type RecoveredTransform = {
  rotationDeg?: number;
  scale?: number;
  flipH?: boolean;
  flipV?: boolean;
};

export type MatchRegions = {
  a: RegionBox[];
  b: RegionBox[];
};

export const figureMatchesTable = pgTable(
  "figure_matches",
  {
    id: serial("id").primaryKey(),
    // Canonical ordering: figureAId < figureBId (enforced by the unique index).
    figureAId: integer("figure_a_id").notNull(),
    figureBId: integer("figure_b_id").notNull(),
    matchClass: text("match_class").$type<MatchClass>().notNull(),
    similarity: doublePrecision("similarity").notNull(),
    transform: jsonb("transform").$type<RecoveredTransform>(),
    regions: jsonb("regions").$type<MatchRegions>(),
    status: text("status").$type<MatchStatus>().notNull().default("unreviewed"),
    reviewerId: text("reviewer_id"),
    reviewerNote: text("reviewer_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Dedupe: one row per unordered figure pair.
    pairUnique: uniqueIndex("figure_matches_pair_unique").on(t.figureAId, t.figureBId),
    statusIdx: index("figure_matches_status_idx").on(t.status),
  }),
);

export type FigureMatch = typeof figureMatchesTable.$inferSelect;
export type InsertFigureMatch = typeof figureMatchesTable.$inferInsert;
