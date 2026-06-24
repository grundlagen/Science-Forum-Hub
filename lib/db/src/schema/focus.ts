import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Focus Guard — a deep-work companion for SciVet.
 *
 * Reading and reviewing science is directed-attention work; an infinite feed
 * is the opposite. Focus Guard lets a researcher pre-commit to a bounded,
 * intentional reading/reviewing sprint and gently guards that attention.
 *
 * The schema is deliberately grounded in attention/motivation psychology so
 * that downstream features (nudges, stats, guard rails) have real signal to
 * work with rather than vanity counters:
 *
 *   - Implementation intentions (Gollwitzer, 1999): every session carries an
 *     "if-then" `intention` string formed *before* work starts.
 *   - Pomodoro / ultradian rhythms (Cirillo; Kleitman's BRAC): `technique`
 *     plus planned focus/break lengths drive timeboxing.
 *   - Flow (Csikszentmihalyi, 1990): `focusRating` captures self-reported flow;
 *     clear goals + immediate feedback are encoded in goal fields.
 *   - Goal-setting theory (Locke & Latham, 2002): specific, measurable
 *     `goalType`/`goalTarget` instead of "try to focus".
 *   - Zeigarnik effect (1927) / cognitive offloading: the distraction
 *     "parking lot" lets intrusive thoughts be captured and set aside.
 *   - Self-Determination Theory (Deci & Ryan, 2000): competence is reinforced
 *     via streaks/stats; autonomy is preserved by making every guard rail
 *     opt-in rather than coercive.
 */

export type FocusTechnique =
  | "pomodoro" // 25/5 timeboxing (Cirillo)
  | "ultradian" // ~90/20 rest-activity cycles (Kleitman's BRAC)
  | "flowmodoro" // focus until flow breaks, then proportional rest
  | "timeboxed"; // a single fixed block, no enforced breaks

export type FocusIntent =
  | "read" // deep-read a paper
  | "review" // cast rigorous reviews/votes
  | "write" // draft or revise a submission
  | "replicate" // work through methods/replication
  | "explore"; // bounded, intentional discovery (anti-doomscroll)

export type FocusGoalType =
  | "papers" // read/engage N papers
  | "reviews" // cast N reviews
  | "minutes" // accumulate N focused minutes
  | "custom"; // free-form, target is a soft marker

export type FocusStatus =
  | "active" // running now
  | "completed" // ended intentionally (goal hit or wrapped up)
  | "abandoned" // ended early by the user
  | "expired"; // never closed; reaped by the server

export type DistractionKind =
  | "thought" // an intrusive idea to revisit later
  | "task" // an unrelated to-do
  | "urge" // an impulse (check email, open the feed…)
  | "external"; // an interruption from outside

/** A single parked distraction (Zeigarnik offload). */
export type FocusDistraction = {
  id: string;
  text: string;
  kind: DistractionKind;
  parkedAt: string; // ISO timestamp
  resolved: boolean;
};

/**
 * Opt-in attention guard rails. Every flag defaults to a supportive,
 * non-coercive value so the feature respects user autonomy (SDT).
 */
export type FocusGuardRails = {
  dimFeed: boolean; // gray the firehose while focused (reduce variable reward)
  hideMetrics: boolean; // hide vote counts/scores (reduce social-comparison hijack)
  singleTaskLock: boolean; // warn when navigating away from the focus subject
  parkingLot: boolean; // enable distraction capture
  breakReminders: boolean; // prompt restorative breaks (Attention Restoration Theory)
};

export type FocusSoundscape =
  | "none"
  | "rain"
  | "cafe"
  | "brown_noise"
  | "library";

export const DEFAULT_GUARD_RAILS: FocusGuardRails = {
  dimFeed: true,
  hideMetrics: false,
  singleTaskLock: false,
  parkingLot: true,
  breakReminders: true,
};

export const focusPreferencesTable = pgTable("focus_preferences", {
  // One row per user; the Clerk user id is the primary key.
  userId: text("user_id").primaryKey(),
  technique: text("technique").$type<FocusTechnique>().notNull().default("pomodoro"),
  focusMinutes: integer("focus_minutes").notNull().default(25),
  breakMinutes: integer("break_minutes").notNull().default(5),
  longBreakMinutes: integer("long_break_minutes").notNull().default(15),
  cyclesBeforeLongBreak: integer("cycles_before_long_break").notNull().default(4),
  dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(90),
  guardRails: jsonb("guard_rails")
    .$type<FocusGuardRails>()
    .notNull()
    .default(DEFAULT_GUARD_RAILS),
  soundscape: text("soundscape").$type<FocusSoundscape>().notNull().default("none"),
  // A personal pre-session mantra / implementation-intention template.
  ritualNudge: text("ritual_nudge"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type FocusPreferences = typeof focusPreferencesTable.$inferSelect;
export type InsertFocusPreferences = typeof focusPreferencesTable.$inferInsert;

export const focusSessionsTable = pgTable(
  "focus_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),

    // Pre-commitment fields (set at start, immutable thereafter).
    intention: text("intention").notNull(), // implementation intention
    technique: text("technique").$type<FocusTechnique>().notNull(),
    intent: text("intent").$type<FocusIntent>().notNull().default("read"),
    plannedMinutes: integer("planned_minutes").notNull(),
    goalType: text("goal_type").$type<FocusGoalType>().notNull().default("minutes"),
    goalTarget: integer("goal_target").notNull().default(1),

    // Optional focus subject — a specific paper and/or field of study.
    paperId: integer("paper_id"),
    field: text("field"),

    // Lifecycle.
    status: text("status").$type<FocusStatus>().notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),

    // Live progress (advanced via heartbeat PATCHes).
    focusSeconds: integer("focus_seconds").notNull().default(0),
    goalProgress: integer("goal_progress").notNull().default(0),
    breaksTaken: integer("breaks_taken").notNull().default(0),

    // Distraction parking lot (Zeigarnik offload) + denormalized count.
    distractions: jsonb("distractions")
      .$type<FocusDistraction[]>()
      .notNull()
      .default([]),
    distractionCount: integer("distraction_count").notNull().default(0),

    // Self-report (set at start/finish) — energy in, flow + mood out.
    energyBefore: integer("energy_before"), // 1–5
    focusRating: integer("focus_rating"), // 1–5 self-reported flow
    moodAfter: text("mood_after"),
    reflection: text("reflection"), // metacognitive post-session note

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userStartedIdx: index("focus_sessions_user_started_idx").on(
      t.userId,
      t.startedAt,
    ),
    userStatusIdx: index("focus_sessions_user_status_idx").on(t.userId, t.status),
  }),
);

export type FocusSession = typeof focusSessionsTable.$inferSelect;
export type InsertFocusSession = typeof focusSessionsTable.$inferInsert;
