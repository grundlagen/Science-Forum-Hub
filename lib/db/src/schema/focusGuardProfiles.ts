import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

/**
 * Focus Guard — per-user profile.
 *
 * Holds (a) the user's chosen guardrail *settings* and (b) rolling *aggregates*
 * the engine needs to reason about decision fatigue across a working session.
 *
 * One row per user, created lazily on first focus session. Kept separate from
 * the generic `profiles` table because these fields are a self-contained,
 * opt-in subsystem with their own lifecycle.
 */
export const focusGuardProfilesTable = pgTable("focus_guard_profiles", {
  userId: text("user_id").primaryKey(),

  // --- Settings (user-tunable guardrails) ---------------------------------
  /**
   * When true, the platform *blocks* low-focus reviews instead of merely
   * warning. Default false: Focus Guard is advisory until a user opts in to
   * being held to a higher standard.
   */
  enforcementEnabled: boolean("enforcement_enabled").notNull().default(false),
  /** Minimum engaged seconds with a paper before a review is considered earned. */
  minReviewEngagementSec: integer("min_review_engagement_sec").notNull().default(90),
  /** Show ~90-minute Basic Rest–Activity Cycle break reminders. */
  ultradianRemindersEnabled: boolean("ultradian_reminders_enabled").notNull().default(true),
  /** Warn when reviewing past the decision-fatigue threshold without a break. */
  fatigueGuardEnabled: boolean("fatigue_guard_enabled").notNull().default(true),
  /** Personal daily focused-minutes goal (gentle, streak-building). */
  dailyFocusGoalMin: integer("daily_focus_goal_min").notNull().default(30),

  // --- Rolling aggregates (engine state) ----------------------------------
  totalFocusedSec: integer("total_focused_sec").notNull().default(0),
  sessionCount: integer("session_count").notNull().default(0),
  /** Reviews cast since the last qualifying break — drives fatigue state. */
  reviewsSinceBreak: integer("reviews_since_break").notNull().default(0),
  lastBreakAt: timestamp("last_break_at", { withTimezone: true }),
  currentStreakDays: integer("current_streak_days").notNull().default(0),
  longestStreakDays: integer("longest_streak_days").notNull().default(0),
  /** Local date (YYYY-MM-DD) of the most recent day a goal was met. */
  lastGoalDate: text("last_goal_date"),
  lastSessionAt: timestamp("last_session_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type FocusGuardProfile = typeof focusGuardProfilesTable.$inferSelect;
export type InsertFocusGuardProfile = typeof focusGuardProfilesTable.$inferInsert;
