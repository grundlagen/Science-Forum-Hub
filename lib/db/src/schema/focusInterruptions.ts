import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

import { focusSessionsTable } from "./focusSessions";

/**
 * The interruption log: every distraction the guard evaluated during a session,
 * together with the verdict evaluateInterruption() returned. This is both the
 * audit trail and the training data for tuning guard strictness per user.
 */

export type InterruptionSource = "internal" | "external";
export type InterruptionKind = "thought" | "notification" | "person" | "physical" | "task";
export type InterruptionUrgency = "trivial" | "routine" | "important" | "emergency";
export type GuardDecision = "allow" | "defer" | "shield";

export const focusInterruptionsTable = pgTable(
  "focus_interruptions",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => focusSessionsTable.id, { onDelete: "cascade" }),
    source: text("source").$type<InterruptionSource>().notNull(),
    kind: text("kind").$type<InterruptionKind>().notNull(),
    urgency: text("urgency").$type<InterruptionUrgency>().notNull().default("routine"),
    /** The verdict the guard returned. */
    decision: text("decision").$type<GuardDecision>().notNull(),
    /** Minutes into the session when it arrived. */
    elapsedMinutes: integer("elapsed_minutes").notNull().default(0),
    /** Did the user ultimately override the guard's verdict? */
    overridden: text("overridden"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("focus_interruptions_session_idx").on(t.sessionId),
  }),
);

export type FocusInterruption = typeof focusInterruptionsTable.$inferSelect;
export type InsertFocusInterruption = typeof focusInterruptionsTable.$inferInsert;
