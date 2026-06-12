import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";

export type FocusCaptureKind = "thought" | "todo" | "lookup";
export type FocusCaptureResolution = "done" | "kept" | "let_go";

export const focusCapturesTable = pgTable(
  "focus_captures",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull(),
    userId: text("user_id").notNull(),
    body: text("body").notNull(),
    kind: text("kind").$type<FocusCaptureKind>().notNull().default("thought"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution").$type<FocusCaptureResolution>(),
  },
  (t) => ({
    sessionIdx: index("focus_captures_session_idx").on(t.sessionId),
    userIdx: index("focus_captures_user_idx").on(t.userId),
  }),
);

export type FocusCapture = typeof focusCapturesTable.$inferSelect;
export type InsertFocusCapture = typeof focusCapturesTable.$inferInsert;
