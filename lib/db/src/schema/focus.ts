/**
 * Focus Guard persistence.
 *
 * Three tables mirror the three nouns of the feature:
 *   - `focus_sessions`     a single protected block of deep work
 *   - `focus_events`       discrete things that happened inside a session
 *   - `focus_preferences`  a user's psychology-tuned guard configuration
 *
 * The string-literal unions are kept in lockstep with `@workspace/focus-engine`
 * so the database, the API, and the scoring logic all speak the same language.
 * (We intentionally type the columns rather than use pg enums: the vocabulary
 * is still evolving and text columns are cheaper to extend than enum types.)
 */

import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";

export type FocusTechnique = "pomodoro" | "ultradian" | "flowtime" | "deep_work" | "custom";
export type FocusMode =
  | "reading"
  | "reviewing"
  | "writing"
  | "commenting"
  | "synthesizing"
  | "exploring";
export type SessionState = "planned" | "active" | "paused" | "completed" | "abandoned";
export type GuardLevel = "gentle" | "standard" | "strict";
export type Chronotype = "lark" | "third_bird" | "owl";
export type IntentionOutcome = "completed" | "partial" | "not_met" | "unset";
export type FocusEventKind =
  | "distraction"
  | "parked_thought"
  | "pause"
  | "resume"
  | "break_start"
  | "break_end"
  | "milestone"
  | "note"
  | "guard_trip";

export const focusSessionsTable = pgTable(
  "focus_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),

    // The implementation intention — the spine of the whole feature.
    intention: text("intention").notNull().default(""),
    intentionScore: integer("intention_score"), // 0-100 specificity at start
    intentionOutcome: text("intention_outcome").$type<IntentionOutcome>().notNull().default("unset"),

    mode: text("mode").$type<FocusMode>().notNull().default("reading"),
    technique: text("technique").$type<FocusTechnique>().notNull().default("pomodoro"),
    /** Optional paper this session is anchored to (the guard's "target"). */
    targetPaperId: integer("target_paper_id"),

    plannedMinutes: integer("planned_minutes").notNull().default(25),
    focusedMinutes: integer("focused_minutes").notNull().default(0),

    state: text("state").$type<SessionState>().notNull().default("planned"),

    // Self-reported context, for adapting recommendations and scoring.
    energyBefore: integer("energy_before"), // 1-5
    energyAfter: integer("energy_after"), // 1-5
    flowRating: integer("flow_rating"), // 1-5

    distractionCount: integer("distraction_count").notNull().default(0),
    parkedThoughtCount: integer("parked_thought_count").notNull().default(0),

    focusScore: doublePrecision("focus_score"), // 0-100, computed at completion

    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userCreatedIdx: index("focus_sessions_user_created_idx").on(t.userId, t.createdAt),
    userStateIdx: index("focus_sessions_user_state_idx").on(t.userId, t.state),
  }),
);

export const focusEventsTable = pgTable(
  "focus_events",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => focusSessionsTable.id, { onDelete: "cascade" }),
    kind: text("kind").$type<FocusEventKind>().notNull(),
    /** Free text — e.g. the content of a parked thought, or a milestone label. */
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("focus_events_session_idx").on(t.sessionId, t.createdAt),
  }),
);

export const focusPreferencesTable = pgTable("focus_preferences", {
  userId: text("user_id").primaryKey(),

  defaultTechnique: text("default_technique").$type<FocusTechnique>().notNull().default("pomodoro"),
  defaultMode: text("default_mode").$type<FocusMode>().notNull().default("reading"),
  guardLevel: text("guard_level").$type<GuardLevel>().notNull().default("standard"),
  chronotype: text("chronotype").$type<Chronotype>().notNull().default("third_bird"),

  /** A self-set, sustainable daily ceiling in minutes (burnout guardrail). */
  dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(120),

  /** Mute hub notifications while a session is active. */
  muteNotifications: boolean("mute_notifications").notNull().default(true),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type FocusSession = typeof focusSessionsTable.$inferSelect;
export type InsertFocusSession = typeof focusSessionsTable.$inferInsert;
export type FocusEvent = typeof focusEventsTable.$inferSelect;
export type InsertFocusEvent = typeof focusEventsTable.$inferInsert;
export type FocusPreferences = typeof focusPreferencesTable.$inferSelect;
export type InsertFocusPreferences = typeof focusPreferencesTable.$inferInsert;
