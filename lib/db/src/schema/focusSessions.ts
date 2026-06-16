import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import type { FocusTechnique } from "./focusProfiles";

/**
 * FocusGuard — a single bounded deep-reading/deep-review session against a paper.
 *
 * A session is a commitment device wrapped around a timer: the user states an
 * implementation intention, picks a timebox, and the platform records how the
 * attempt actually went. Completed, sufficiently-focused sessions are the
 * provenance signal behind a "deep review" badge.
 */

/** What the user intends to accomplish — frames challenge/skill balance for flow. */
export type FocusGoalType = "read" | "review" | "revise" | "explore";

export type FocusSessionStatus = "active" | "paused" | "completed" | "abandoned";

export const focusSessionsTable = pgTable("focus_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),

  // The object of attention. Nullable: a user may run a general focus block.
  paperId: integer("paper_id"),

  goalType: text("goal_type").$type<FocusGoalType>().notNull().default("read"),
  technique: text("technique").$type<FocusTechnique>().notNull().default("pomodoro"),

  // Gollwitzer & Sheeran implementation intention: the if-then plan the user
  // commits to before starting ("When I start, I will assess the methodology").
  intent: text("intent").notNull(),

  // The timebox the user pre-commits to (Parkinson's law countermeasure).
  plannedMinutes: integer("planned_minutes").notNull().default(25),
  breakMinutes: integer("break_minutes").notNull().default(5),

  status: text("status").$type<FocusSessionStatus>().notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),

  // Accumulated focused time, excluding paused/break spans — the honest measure.
  focusedSeconds: integer("focused_seconds").notNull().default(0),

  // Self-monitoring (CBT): each logged urge-to-switch tends to reduce switching.
  distractionCount: integer("distraction_count").notNull().default(0),
  breaksTaken: integer("breaks_taken").notNull().default(0),

  // Post-session reflection. 1–5 self-reports; null until the user reflects.
  focusRating: integer("focus_rating"),
  // Csikszentmihalyi flow self-report (absorption / time distortion).
  flowRating: integer("flow_rating"),
  reflection: text("reflection"),

  // Effort-justification provenance: links a session to the review it produced,
  // so the community can trust that a verdict followed sustained attention.
  resultReviewId: integer("result_review_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FocusSession = typeof focusSessionsTable.$inferSelect;
export type InsertFocusSession = typeof focusSessionsTable.$inferInsert;
