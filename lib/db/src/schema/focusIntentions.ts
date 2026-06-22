import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  doublePrecision,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Implementation intentions ("if <cue>, then I will <action>"). Gollwitzer's
 * if-then plans roughly double goal attainment by pre-binding a response to a
 * cue. Optionally attached to the paper the intention serves. `strength` is the
 * 0..1 estimate from focus-guard's validateIntention().
 */

export type IntentionCueType = "time" | "location" | "event" | "completion";

export const focusIntentionsTable = pgTable("focus_intentions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  /** Optional FK to papers.id. */
  paperId: integer("paper_id"),
  cueType: text("cue_type").$type<IntentionCueType>().notNull(),
  cue: text("cue").notNull(),
  action: text("action").notNull(),
  /** 0..1 specificity/strength from validateIntention(). */
  strength: doublePrecision("strength").notNull().default(0),
  active: boolean("active").notNull().default(true),
  /** Times this intention's cue fired and the action followed. */
  timesFulfilled: integer("times_fulfilled").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FocusIntention = typeof focusIntentionsTable.$inferSelect;
export type InsertFocusIntention = typeof focusIntentionsTable.$inferInsert;
