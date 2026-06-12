import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { isNull } from "drizzle-orm";

export type FocusLockMode = "gentle" | "ulysses";
export type FocusOutcome = "completed" | "abandoned" | "overran" | "expired";
export type FocusFelt = "too_easy" | "engaged" | "overwhelmed";

export const focusSessionsTable = pgTable(
  "focus_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    paperId: integer("paper_id"),
    intention: text("intention").notNull(),
    plannedMinutes: integer("planned_minutes").notNull(),
    lockMode: text("lock_mode").$type<FocusLockMode>().notNull().default("gentle"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    outcome: text("outcome").$type<FocusOutcome>(),
    actualSeconds: integer("actual_seconds"),
    felt: text("felt").$type<FocusFelt>(),
    abandonReason: text("abandon_reason"),
    closingNote: text("closing_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdx: index("focus_sessions_user_idx").on(t.userId, t.startedAt),
    // One attention per person: at most one open session per user.
    oneActivePerUser: uniqueIndex("focus_sessions_one_active_per_user")
      .on(t.userId)
      .where(isNull(t.endedAt)),
  }),
);

export type FocusSession = typeof focusSessionsTable.$inferSelect;
export type InsertFocusSession = typeof focusSessionsTable.$inferInsert;
