import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type ReviewStance = "endorse" | "challenge" | "reject";

export const reviewsTable = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    paperId: integer("paper_id").notNull(),
    authorId: text("author_id").notNull(),
    stance: text("stance").$type<ReviewStance>().notNull(),
    justification: text("justification").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    paperAuthorUnique: uniqueIndex("reviews_paper_author_unique").on(t.paperId, t.authorId),
  }),
);

export type Review = typeof reviewsTable.$inferSelect;
export type InsertReview = typeof reviewsTable.$inferInsert;
