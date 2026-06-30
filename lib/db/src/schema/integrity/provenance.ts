import {
  pgTable,
  serial,
  text,
  integer,
  date,
  timestamp,
} from "drizzle-orm/pg-core";

// Provenance: every canonical datum can be traced to a source snapshot with a content
// hash and a public_as_of date. This feeds the public-disclosure-bar analysis.
export const riProvenanceTable = pgTable("ri_provenance", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  source: text("source").notNull(),
  sourceUrl: text("source_url"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  contentSha256: text("content_sha256").notNull(),
  publicAsOf: date("public_as_of"),
  waybackUrl: text("wayback_url"),
});
export type RiProvenance = typeof riProvenanceTable.$inferSelect;
export type InsertRiProvenance = typeof riProvenanceTable.$inferInsert;

// Immutable record of what a reviewer independently derived, and when. This is the
// spine of the FCA original-source defence (knowledge that "materially adds").
export const riOriginalSourceLogTable = pgTable("ri_original_source_log", {
  id: serial("id").primaryKey(),
  caseRef: text("case_ref"),
  reviewerId: text("reviewer_id").notNull(),
  derivedAt: timestamp("derived_at", { withTimezone: true }).notNull().defaultNow(),
  independentAnalysis: text("independent_analysis").notNull(),
  inputsHash: text("inputs_hash"),
});
export type RiOriginalSourceLog = typeof riOriginalSourceLogTable.$inferSelect;
export type InsertRiOriginalSourceLog = typeof riOriginalSourceLogTable.$inferInsert;
