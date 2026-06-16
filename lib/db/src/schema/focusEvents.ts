import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { focusSessionsTable } from "./focusSessions";

/**
 * FocusGuard — the timeline of what happened inside a session.
 *
 * This is the self-monitoring log (Kanfer): pauses, resumes, breaks, and the
 * single most useful entry — a logged "distraction", i.e. the moment the user
 * felt the pull to switch away and named it instead of acting on it. Recording
 * the urge is itself the intervention.
 */
export type FocusEventKind =
  | "distraction"
  | "pause"
  | "resume"
  | "break_start"
  | "break_end"
  | "note"
  | "milestone";

export const focusEventsTable = pgTable("focus_events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => focusSessionsTable.id, { onDelete: "cascade" }),
  kind: text("kind").$type<FocusEventKind>().notNull(),
  // Optional context: what tried to pull you away, or a milestone label.
  note: text("note"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FocusEvent = typeof focusEventsTable.$inferSelect;
export type InsertFocusEvent = typeof focusEventsTable.$inferInsert;
