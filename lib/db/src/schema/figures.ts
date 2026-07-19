import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Where a figure came from. Figures are NOT limited to SciVet submissions —
 * Integrity Mode ingests figures from external open-access corpora too, so a
 * figure may have no owning `paperId`.
 */
export type FigureSourceType = "submission" | "pmc" | "biorxiv" | "upload";

export const figuresTable = pgTable(
  "figures",
  {
    id: serial("id").primaryKey(),
    // Nullable: external-corpus figures are not tied to a SciVet paper.
    paperId: integer("paper_id"),
    // Self-reference (nullable): panels split out of a parent figure point here.
    parentFigureId: integer("parent_figure_id"),
    sourceType: text("source_type").$type<FigureSourceType>().notNull(),
    // DOI / PMCID / URL identifying the provenance of the source document.
    sourceRef: text("source_ref"),
    panelLabel: text("panel_label"),
    caption: text("caption"),
    storageKey: text("storage_key").notNull(),
    width: integer("width"),
    height: integer("height"),
    // Perceptual hash (hex string) used for the near-duplicate prefilter.
    phash: text("phash"),
    // Optional dense embedding for ANN similarity (jsonb array of numbers until
    // pgvector is provisioned).
    embedding: jsonb("embedding").$type<number[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    paperIdx: index("figures_paper_idx").on(t.paperId),
    phashIdx: index("figures_phash_idx").on(t.phash),
    parentIdx: index("figures_parent_idx").on(t.parentFigureId),
  }),
);

export type Figure = typeof figuresTable.$inferSelect;
export type InsertFigure = typeof figuresTable.$inferInsert;
