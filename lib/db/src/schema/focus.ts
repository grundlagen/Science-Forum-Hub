import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Focus Guard — deep-work sessions for citizen scientists.
 *
 * Reading dense papers, writing rigorous prose, and reviewing critically are
 * cognitively expensive acts that are fragile to interruption. Focus Guard is
 * the platform's attempt to protect and cultivate that scarce attention. The
 * schema is deliberately grounded in attention/motivation psychology rather
 * than gamified streak-bait — see lib/db/src/schema/focus.ts notes inline and
 * FOCUS_GUARD.md for the full literature map.
 */

/** What kind of deep work the session is dedicated to. Ties focus to the platform's verbs. */
export type FocusActivity = "reading" | "writing" | "reviewing" | "deep_work";

/**
 * The break/work cadence the session rides.
 *  - pomodoro:    classic 25/5 timeboxing (Cirillo) — good for activation/dread.
 *  - ultradian:   ~90 min sprints with longer recovery (Basner/Kleitman BRAC) — good for flow.
 *  - flow_state:  no fixed breaks; ride absorption until it breaks (Csikszentmihalyi).
 *  - custom:      user-defined work/break minutes.
 */
export type FocusCadence = "pomodoro" | "ultradian" | "flow_state" | "custom";

/** Lifecycle of a single session. Abandoned is *not* a moral failure — see gentleMode. */
export type FocusSessionStatus =
  | "planned"
  | "active"
  | "paused"
  | "completed"
  | "abandoned";

/**
 * Taxonomy of what pulls attention, so the "parking lot" can teach the user
 * about their own distraction signature over time (metacognition).
 *  - internal_thought:      a stray idea / to-do surfacing (Zeigarnik tension).
 *  - external_interruption: a person, ping, or environment event.
 *  - task_switch_urge:      the itch to check something / open a new tab.
 *  - anxiety:               worry/rumination competing for working memory.
 */
export type DistractionKind =
  | "internal_thought"
  | "external_interruption"
  | "task_switch_urge"
  | "anxiety";

/**
 * The protective "guards" active for a session. Each one removes a specific
 * source of extraneous cognitive load (Sweller) or a task-switch affordance.
 * Stored as a snapshot on the session so we can correlate guards with outcomes.
 */
export type FocusGuardConfig = {
  /** Hide the discovery feed & vote counts — kill the variable-reward slot machine. */
  hideFeed: boolean;
  /** Suppress in-app notifications during the session — avoid attention residue (Leroy, 2009). */
  muteNotifications: boolean;
  /** Desaturate the UI — strip salient colour cues that bid for attention. */
  grayscale: boolean;
  /** Add friction to leaving the workspace (confirm-before-navigate). */
  blockExternal: boolean;
  /** A pre-committed "single tab / single task" pledge shown at start (implementation intention). */
  oneTabPledge: boolean;
};

export const DEFAULT_GUARDS: FocusGuardConfig = {
  hideFeed: true,
  muteNotifications: true,
  grayscale: false,
  blockExternal: true,
  oneTabPledge: true,
};

/**
 * A single bounded deep-work session.
 *
 * Each session opens with a concrete `intention` (Locke & Latham goal-setting +
 * Gollwitzer implementation intentions) and, optionally, a `paperId` it is in
 * service of. Post-session self-ratings (`flowScore`, energy deltas, `reflection`)
 * feed the metacognitive loop that turns one-off sprints into a trainable skill.
 */
export const focusSessionsTable = pgTable(
  "focus_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** Optional paper this session is in service of (read/write/review). */
    paperId: integer("paper_id"),
    activity: text("activity").$type<FocusActivity>().notNull().default("deep_work"),
    /** The single, specific, pre-committed goal for this block. The heart of the feature. */
    intention: text("intention").notNull(),
    cadence: text("cadence").$type<FocusCadence>().notNull().default("pomodoro"),
    /** Planned focused minutes (the timebox). */
    plannedMinutes: integer("planned_minutes").notNull().default(25),
    /** Planned restorative break minutes — breaks are part of the work, not a reward. */
    breakMinutes: integer("break_minutes").notNull().default(5),
    guards: jsonb("guards").$type<FocusGuardConfig>().notNull().default(DEFAULT_GUARDS),
    status: text("status").$type<FocusSessionStatus>().notNull().default("planned"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Accumulated *focused* seconds, excluding paused time. The honest measure of the block. */
    focusedSeconds: integer("focused_seconds").notNull().default(0),
    /** Self-rated absorption 1–5 (flow proxy). Competence feedback, not a score to optimise. */
    flowScore: integer("flow_score"),
    /** Self-rated energy 1–5 before & after — Attention Restoration tracking (Kaplan). */
    energyBefore: integer("energy_before"),
    energyAfter: integer("energy_after"),
    /** Free-text post-session reflection (metacognition / what to change next time). */
    reflection: text("reflection"),
    /** Denormalised count of parked distractions, for cheap list rendering. */
    distractionCount: integer("distraction_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userStatusIdx: index("focus_sessions_user_status_idx").on(t.userId, t.status),
    userStartedIdx: index("focus_sessions_user_started_idx").on(t.userId, t.startedAt),
  }),
);

export type FocusSession = typeof focusSessionsTable.$inferSelect;
export type InsertFocusSession = typeof focusSessionsTable.$inferInsert;

/**
 * The "parking lot": distractions captured *without* acting on them.
 *
 * Offloading an intrusive thought to a trusted external store discharges the
 * Zeigarnik tension that would otherwise keep it cycling in working memory,
 * so attention can return to the task. `breached` records whether it actually
 * pulled the user out (vs. merely noted), and `resolved` closes the loop later.
 */
export const focusDistractionsTable = pgTable(
  "focus_distractions",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").notNull(),
    /** Denormalised for per-user distraction analytics without a join. */
    userId: text("user_id").notNull(),
    kind: text("kind").$type<DistractionKind>().notNull(),
    /** The parked item itself ("call dentist", "is my stats test wrong?"). */
    note: text("note").notNull(),
    /** Did this actually break focus, or was it noted and waved through? */
    breached: boolean("breached").notNull().default(false),
    /** Has the user since dealt with the parked item? (loop closed) */
    resolved: boolean("resolved").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("focus_distractions_session_idx").on(t.sessionId),
    userIdx: index("focus_distractions_user_idx").on(t.userId),
  }),
);

export type FocusDistraction = typeof focusDistractionsTable.$inferSelect;
export type InsertFocusDistraction = typeof focusDistractionsTable.$inferInsert;

/**
 * Per-user Focus Guard configuration. One row per user (id == userId), mirroring
 * the profiles table convention. Defaults encode a humane baseline: short blocks,
 * a sane daily goal, guards on, and `gentleMode` true.
 *
 * `gentleMode` is load-bearing psychology, not a toggle for niceness: when on,
 * abandoned sessions and missed days are framed without penalty to avoid the
 * abstinence-violation / "what-the-hell" effect (Marlatt) and to keep motivation
 * autonomous rather than shame-driven (Self-Determination Theory).
 */
export const focusPreferencesTable = pgTable("focus_preferences", {
  userId: text("user_id").primaryKey(),
  defaultCadence: text("default_cadence").$type<FocusCadence>().notNull().default("pomodoro"),
  defaultPlannedMinutes: integer("default_planned_minutes").notNull().default(25),
  defaultBreakMinutes: integer("default_break_minutes").notNull().default(5),
  /** Daily focused-minutes goal (specific & moderately challenging). */
  dailyGoalMinutes: integer("daily_goal_minutes").notNull().default(90),
  guards: jsonb("guards").$type<FocusGuardConfig>().notNull().default(DEFAULT_GUARDS),
  /** Non-punitive framing for slips & broken streaks. On by default, on purpose. */
  gentleMode: boolean("gentle_mode").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type FocusPreferences = typeof focusPreferencesTable.$inferSelect;
export type InsertFocusPreferences = typeof focusPreferencesTable.$inferInsert;
