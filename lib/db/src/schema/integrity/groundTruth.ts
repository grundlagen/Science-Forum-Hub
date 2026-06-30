import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  doublePrecision,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type GroundTruthVector =
  | "image_manipulation"
  | "fabricated_data"
  | "foreign_funding"
  | "effort_reporting"
  | "non_performance";

export type GroundTruthSource =
  | "doj_settlement"
  | "ori_finding"
  | "retraction_watch"
  | "nsf_oig"
  | "court_docket";

// Labelled known-positive outcomes. Doubles as the detector validation set (the basis
// for the "reliable correlation to fraud" metrics FOCUS asks data miners to demonstrate).
export const riGroundTruthCasesTable = pgTable(
  "ri_ground_truth_cases",
  {
    id: serial("id").primaryKey(),
    label: text("label").notNull(),
    vector: text("vector").$type<GroundTruthVector>().notNull(),
    source: text("source").$type<GroundTruthSource>().notNull(),
    year: integer("year"),
    settlementUsd: doublePrecision("settlement_usd"),
    relatorShareUsd: doublePrecision("relator_share_usd"),
    govtIntervened: boolean("govt_intervened"),
    referenceUrl: text("reference_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    labelVectorUnique: uniqueIndex("ri_ground_truth_label_vector_unique").on(t.label, t.vector),
  }),
);
export type RiGroundTruthCase = typeof riGroundTruthCasesTable.$inferSelect;
export type InsertRiGroundTruthCase = typeof riGroundTruthCasesTable.$inferInsert;
