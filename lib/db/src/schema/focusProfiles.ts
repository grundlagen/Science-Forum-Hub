import { pgTable, text, integer, boolean, date, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * FocusGuard — per-user preferences and the slow-moving behavioural state
 * (streaks) that the rest of the feature reads from.
 *
 * Each field is anchored to an evidence-based attention/behaviour principle so
 * the product nudges, rather than nags. See `docs/focus-guard.md` for the full
 * rationale and citations.
 */

/** Pacing strategy for a deep-reading session. */
export type FocusTechnique =
  // Cirillo's Pomodoro: fixed 25/5 work–break cadence; good for procrastinators.
  | "pomodoro"
  // Newport's Deep Work: long (50+ min) uninterrupted blocks; good for hard reads.
  | "deep_work"
  // Flowtime: work until natural flow break, then rest proportionally; protects flow.
  | "flowtime"
  // User-defined timebox (Parkinson's-law countermeasure).
  | "timeboxed";

/**
 * Roenneberg's chronotype — when a person's directed-attention capacity peaks.
 * Used to recommend *when* to schedule deep work, not to gate anything.
 */
export type Chronotype = "morning" | "evening" | "flexible";

export const focusProfilesTable = pgTable("focus_profiles", {
  // One row per user; mirrors profiles.id (Clerk user id) by convention.
  userId: text("user_id").primaryKey(),

  // Goal-setting theory (Locke & Latham): sensible, specific defaults the user owns.
  defaultTechnique: text("default_technique").$type<FocusTechnique>().notNull().default("pomodoro"),
  defaultFocusMinutes: integer("default_focus_minutes").notNull().default(25),
  defaultBreakMinutes: integer("default_break_minutes").notNull().default(5),

  // A specific, challenging-but-attainable daily target outperforms "do your best".
  dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(50),

  chronotype: text("chronotype").$type<Chronotype>().notNull().default("flexible"),

  // Commitment device / Ulysses pact (Thaler & Sunstein): a self-authored pledge
  // the user re-affirms before each session.
  pledge: text("pledge"),

  // Pre-committed list of distractions to silence for the duration of a session.
  distractionBlocklist: jsonb("distraction_blocklist").$type<string[]>().notNull().default([]),

  // Self-determination theory: nudges are opt-out, never coercive.
  nudgesEnabled: boolean("nudges_enabled").notNull().default(true),

  // Goal-gradient hypothesis (Hull; Kivetz): streaks motivate as the goal nears.
  // Kept honest — only *qualifying* deep sessions advance the streak.
  streakCount: integer("streak_count").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  // Date (no time) of the last qualifying session, for streak continuity math.
  lastQualifyingDate: date("last_qualifying_date"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type FocusProfile = typeof focusProfilesTable.$inferSelect;
export type InsertFocusProfile = typeof focusProfilesTable.$inferInsert;
