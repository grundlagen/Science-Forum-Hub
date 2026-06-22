import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * The "open-loop" parking lot. When the guard shields an intrusive thought or
 * task-switch urge, the thought is captured here rather than acted on — the
 * Zeigarnik release. Items are resurfaced at the user's next break so nothing
 * is lost, which is exactly what lets the mind let go of them mid-session.
 */

export type OpenLoopStatus = "open" | "resurfaced" | "done" | "dropped";

export const focusOpenLoopsTable = pgTable(
  "focus_open_loops",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** The session during which it was captured (if any). */
    sessionId: integer("session_id"),
    body: text("body").notNull(),
    status: text("status").$type<OpenLoopStatus>().notNull().default("open"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    userStatusIdx: index("focus_open_loops_user_status_idx").on(t.userId, t.status),
  }),
);

export type FocusOpenLoop = typeof focusOpenLoopsTable.$inferSelect;
export type InsertFocusOpenLoop = typeof focusOpenLoopsTable.$inferInsert;
