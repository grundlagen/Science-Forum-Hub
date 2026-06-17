/**
 * Focus Guard persistence.
 *
 * Two append-friendly tables back the pure `@workspace/focus-guard` engine:
 *
 *   • focus_sessions — one row per reviewer "sitting"; the rolling counters the
 *     engine reads (reviews done, breaks taken, last break / paper-close times).
 *   • focus_events   — an append-only event log (paper opened/closed, scroll
 *     progress, verdict committed, break started/ended) that the session
 *     counters are folded from. Keeping the raw log lets us re-tune the
 *     psychological parameters and recompute history.
 */
import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export type Chronotype = "early" | "neutral" | "late";

export type FocusEventType =
  | "session_started"
  | "paper_opened"
  | "scroll_progress"
  | "stance_committed"
  | "verdict_committed"
  | "paper_closed"
  | "break_started"
  | "break_ended";

/** Free-form payload per event (e.g. { paperId, scrollCoverage, dwellMs }). */
export type FocusEventDataJson = Record<string, number | string | boolean | null>;

export const focusSessionsTable = pgTable(
  "focus_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null while the session is live; set when it is closed out. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    reviewsCompleted: integer("reviews_completed").notNull().default(0),
    breaksTaken: integer("breaks_taken").notNull().default(0),
    lastBreakEndedAt: timestamp("last_break_ended_at", { withTimezone: true }),
    lastPaperClosedAt: timestamp("last_paper_closed_at", { withTimezone: true }),
    /** Most recent fatigue score (0..1) computed for this session. */
    lastFatigueScore: doublePrecision("last_fatigue_score"),
    chronotype: text("chronotype").$type<Chronotype>().notNull().default("neutral"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdx: index("focus_sessions_user_idx").on(t.userId),
  }),
);

export const focusEventsTable = pgTable(
  "focus_events",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => focusSessionsTable.id, { onDelete: "cascade" }),
    paperId: integer("paper_id"),
    type: text("type").$type<FocusEventType>().notNull(),
    data: jsonb("data").$type<FocusEventDataJson>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("focus_events_session_idx").on(t.sessionId),
  }),
);

export type FocusSessionRow = typeof focusSessionsTable.$inferSelect;
export type InsertFocusSession = typeof focusSessionsTable.$inferInsert;
export type FocusEventRow = typeof focusEventsTable.$inferSelect;
export type InsertFocusEvent = typeof focusEventsTable.$inferInsert;
