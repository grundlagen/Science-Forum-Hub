import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  doublePrecision,
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
    /**
     * Focus Guard quality (0..100) of the reading session that produced this
     * review, if one existed. Lets the platform weight judgements by the
     * attention that backed them rather than treating all votes as equal.
     */
    focusScore: doublePrecision("focus_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    paperAuthorUnique: uniqueIndex("reviews_paper_author_unique").on(t.paperId, t.authorId),
  }),
);

export type Review = typeof reviewsTable.$inferSelect;
export type InsertReview = typeof reviewsTable.$inferInsert;
