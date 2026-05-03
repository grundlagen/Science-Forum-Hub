import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const paperRevisionsTable = pgTable("paper_revisions", {
  id: serial("id").primaryKey(),
  paperId: integer("paper_id").notNull(),
  revisionNumber: integer("revision_number").notNull(),
  title: text("title").notNull(),
  abstract: text("abstract").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaperRevision = typeof paperRevisionsTable.$inferSelect;
export type InsertPaperRevision = typeof paperRevisionsTable.$inferInsert;
