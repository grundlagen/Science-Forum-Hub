import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  integer,
  doublePrecision,
} from "drizzle-orm/pg-core";

export type PaperStage = "draft" | "under_review" | "promoted" | "published";

export type PaperReferenceJson = {
  citation: string;
  url: string | null;
};

export const papersTable = pgTable("papers", {
  id: serial("id").primaryKey(),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  abstract: text("abstract").notNull(),
  body: text("body").notNull(),
  fields: text("fields").array().notNull().default([]),
  references: jsonb("references").$type<PaperReferenceJson[]>().notNull().default([]),
  stage: text("stage").$type<PaperStage>().notNull().default("draft"),
  rigorScore: doublePrecision("rigor_score"),
  aiConfidence: doublePrecision("ai_confidence"),
  revisionCount: integer("revision_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Paper = typeof papersTable.$inferSelect;
export type InsertPaper = typeof papersTable.$inferInsert;
