import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * A single focus session — the unit of deep work Focus Guard protects and
 * scores. Optionally tied to the paper being worked on so we can correlate
 * focus with research output. The score fields are populated on completion by
 * @workspace/focus-guard's scoreSession() (peak-end weighted).
 */

export type SessionMode = "deep" | "shallow" | "review" | "restorative";
export type SessionOutcome = "active" | "completed" | "extended" | "abandoned" | "interrupted";
export type FlowChannel =
  | "flow"
  | "arousal"
  | "control"
  | "relaxation"
  | "boredom"
  | "apathy"
  | "worry"
  | "anxiety";

export const focusSessionsTable = pgTable(
  "focus_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    /** Optional FK to papers.id — the work this session was spent on. */
    paperId: integer("paper_id"),
    mode: text("mode").$type<SessionMode>().notNull().default("deep"),
    /** Planned length from recommendSession(), in minutes. */
    plannedMinutes: integer("planned_minutes").notNull(),
    /** Actual focused minutes, set on completion. */
    actualMinutes: integer("actual_minutes"),

    // Self-reports captured at start (engine inputs).
    challenge: integer("challenge"),
    skill: integer("skill"),
    arousal: integer("arousal"),
    flowChannel: text("flow_channel").$type<FlowChannel>(),
    residueAtStart: doublePrecision("residue_at_start"),

    // Reflection captured at end (peak-end scoring inputs).
    peakIntensity: integer("peak_intensity"),
    endSatisfaction: integer("end_satisfaction"),
    meanIntensity: integer("mean_intensity"),

    outcome: text("outcome").$type<SessionOutcome>().notNull().default("active"),
    /** 0..100 remembered-quality score from scoreSession(). */
    qualityScore: doublePrecision("quality_score"),
    interruptionsHonored: integer("interruptions_honored").notNull().default(0),
    interruptionsShielded: integer("interruptions_shielded").notNull().default(0),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => ({
    userStartedIdx: index("focus_sessions_user_started_idx").on(t.userId, t.startedAt),
    paperIdx: index("focus_sessions_paper_idx").on(t.paperId),
  }),
);

export type FocusSession = typeof focusSessionsTable.$inferSelect;
export type InsertFocusSession = typeof focusSessionsTable.$inferInsert;
