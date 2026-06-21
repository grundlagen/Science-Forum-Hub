import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  doublePrecision,
  jsonb,
} from "drizzle-orm/pg-core";

/**
 * Focus Guard — a psychologically-grounded deep-work companion for reviewers.
 *
 * SciVet's review quality depends on the *attentional state* of the reviewer.
 * A rushed, distracted, or cognitively depleted reviewer produces shallow or
 * biased judgments. Focus Guard makes the attentional and cognitive conditions
 * of good reviewing first-class. See docs/focus-guard/DESIGN.md for the full
 * psychology rationale behind every column here.
 */

/** What kind of deep work a session is for. */
export type FocusMode = "review" | "read" | "write" | "triage";

/** A person's natural circadian preference, used to schedule nudges. */
export type Chronotype = "lark" | "owl" | "neutral";

export type FocusSessionStatus = "active" | "completed" | "abandoned";

/**
 * Event types logged during a session. Interruptions and parked thoughts let
 * us honour the Zeigarnik effect — offloading open loops out of working memory.
 */
export type FocusEventType =
  | "interruption"
  | "parked_thought"
  | "break_start"
  | "break_end"
  | "guard_shown"
  | "guard_acknowledged";

/**
 * One row per user. Holds Focus Guard settings plus the rolling psychological
 * state we use to personalise recommendations (Self-Determination Theory:
 * autonomy via settings, competence via streaks framed kindly).
 */
export const focusProfilesTable = pgTable("focus_profiles", {
  userId: text("user_id").primaryKey(),
  // Preferences (autonomy).
  preferredSessionMinutes: integer("preferred_session_minutes").notNull().default(50),
  preferredBreakMinutes: integer("preferred_break_minutes").notNull().default(10),
  dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(90),
  chronotype: text("chronotype").$type<Chronotype>().notNull().default("neutral"),
  // Cognitive guards (opt-out, on by default).
  blindPassEnabled: boolean("blind_pass_enabled").notNull().default(true),
  steelmanGuardEnabled: boolean("steelman_guard_enabled").notNull().default(true),
  depletionGuardEnabled: boolean("depletion_guard_enabled").notNull().default(true),
  /** Extra-kind nudges, softer language, no streak pressure at all. */
  gentleMode: boolean("gentle_mode").notNull().default(false),
  // Kind-streak state. A missed day spends a grace token before resetting.
  currentStreakDays: integer("current_streak_days").notNull().default(0),
  longestStreakDays: integer("longest_streak_days").notNull().default(0),
  graceTokens: integer("grace_tokens").notNull().default(1),
  lastSessionDate: text("last_session_date"), // YYYY-MM-DD in the user's day.
  // Lifetime aggregates (competence).
  totalFocusMinutes: integer("total_focus_minutes").notNull().default(0),
  sessionsCompleted: integer("sessions_completed").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type FocusProfile = typeof focusProfilesTable.$inferSelect;
export type InsertFocusProfile = typeof focusProfilesTable.$inferInsert;

/**
 * A single deep-work session. The `intent` column is an implementation
 * intention (Gollwitzer): a concrete "I will do X" pre-commitment that
 * dramatically increases follow-through and protects against drift.
 */
export const focusSessionsTable = pgTable("focus_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  /** Optional paper this session is dedicated to (mono-tasking → less attention residue). */
  paperId: integer("paper_id"),
  mode: text("mode").$type<FocusMode>().notNull().default("review"),
  intent: text("intent").notNull(),
  plannedMinutes: integer("planned_minutes").notNull().default(50),
  status: text("status").$type<FocusSessionStatus>().notNull().default("active"),
  /** Self-reported cognitive depletion 1 (fresh) – 5 (spent), captured at start. */
  depletionBefore: integer("depletion_before"),
  depletionAfter: integer("depletion_after"),
  /** Subjective flow 1 (scattered) – 5 (deep flow), captured at completion. */
  flowRating: integer("flow_rating"),
  /** 0–100 quality score derived from focus ratio, interruptions, flow. */
  focusScore: doublePrecision("focus_score"),
  actualFocusSeconds: integer("actual_focus_seconds").notNull().default(0),
  interruptionCount: integer("interruption_count").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  reflection: text("reflection"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type FocusSession = typeof focusSessionsTable.$inferSelect;
export type InsertFocusSession = typeof focusSessionsTable.$inferInsert;

/** Append-only log of things that happened during a session. */
export const focusEventsTable = pgTable("focus_events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  userId: text("user_id").notNull(),
  type: text("type").$type<FocusEventType>().notNull().default("interruption"),
  note: text("note"),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FocusEvent = typeof focusEventsTable.$inferSelect;
export type InsertFocusEvent = typeof focusEventsTable.$inferInsert;
