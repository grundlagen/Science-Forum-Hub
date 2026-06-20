import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  doublePrecision,
  index,
} from "drizzle-orm/pg-core";

/**
 * Focus Guard — session tracking.
 *
 * A "focus session" is a single, bounded episode of a user engaging with a
 * paper (reading, reviewing, or skimming). Sessions are the raw substrate that
 * the Focus Guard psychology engine scores. They exist to answer one question
 * the rest of the platform cannot: *was this person actually paying attention
 * when they formed their judgement?*
 *
 * The schema deliberately stores raw, additive signals (active vs. idle time,
 * scroll coverage, distraction events) rather than derived verdicts, so the
 * scoring model can evolve without a data migration.
 */

export type FocusIntent = "read" | "review" | "skim";

export type FocusSessionState = "active" | "completed" | "abandoned";

/**
 * The ultradian phase a session reached, per the Basic Rest–Activity Cycle
 * (Kleitman). Recorded at end-of-session for later analysis of when on the
 * ~90-minute arc a judgement was actually made.
 */
export type UltradianPhase = "rising" | "peak" | "trough";

export const focusSessionsTable = pgTable(
  "focus_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** Nullable: a user can focus on the feed/explore surface, not just a paper. */
    paperId: integer("paper_id"),
    intent: text("intent").$type<FocusIntent>().notNull().default("read"),
    state: text("state").$type<FocusSessionState>().notNull().default("active"),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),

    /** Foreground, non-idle milliseconds — the real currency of attention. */
    activeMs: integer("active_ms").notNull().default(0),
    /** Time the tab/page was idle or backgrounded while the session was open. */
    idleMs: integer("idle_ms").notNull().default(0),
    /** Deepest fraction of the document scrolled, 0..1. */
    scrollDepth: doublePrecision("scroll_depth").notNull().default(0),
    /** Tab blurs / visibility losses — proxy for context-switching cost. */
    distractionEvents: integer("distraction_events").notNull().default(0),
    /** Deliberate breaks taken during the session (attention restoration). */
    breaksTaken: integer("breaks_taken").notNull().default(0),

    /** Computed 0..100 on end-of-session by the Focus Guard engine. */
    focusScore: doublePrecision("focus_score"),
    ultradianPhase: text("ultradian_phase").$type<UltradianPhase>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("focus_sessions_user_idx").on(t.userId),
    paperIdx: index("focus_sessions_paper_idx").on(t.paperId),
    userPaperIdx: index("focus_sessions_user_paper_idx").on(t.userId, t.paperId),
  }),
);

export type FocusSession = typeof focusSessionsTable.$inferSelect;
export type InsertFocusSession = typeof focusSessionsTable.$inferInsert;
