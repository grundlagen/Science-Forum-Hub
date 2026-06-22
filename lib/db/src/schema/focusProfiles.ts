import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";

/**
 * Per-user Focus Guard settings. Mirrors the inputs the @workspace/focus-guard
 * engine treats as stable traits (chronotype, distraction sensitivity, preferred
 * cadence) so the engine can be seeded with real values instead of defaults.
 */

export type Chronotype = "lark" | "intermediate" | "owl";
export type PreferredTechnique = "ultradian" | "pomodoro" | "flowmodoro" | "adaptive";

export const focusProfilesTable = pgTable("focus_profiles", {
  /** FK to profiles.id (one focus profile per user). */
  userId: text("user_id").primaryKey(),
  chronotype: text("chronotype").$type<Chronotype>().notNull().default("intermediate"),
  /** 1 (unbothered) .. 10 (highly distractible); shapes guard strictness. */
  distractionSensitivity: integer("distraction_sensitivity").notNull().default(5),
  preferredTechnique: text("preferred_technique")
    .$type<PreferredTechnique>()
    .notNull()
    .default("adaptive"),
  /** Self-reported daily deep-work capacity in minutes (budget baseline). */
  dailyBudgetMinutes: integer("daily_budget_minutes").notNull().default(240),
  /** Missed days forgiven before a streak breaks (anti "what-the-hell"). */
  graceTokens: integer("grace_tokens").notNull().default(1),
  /** Whether the guard may shield notifications automatically. */
  guardEnabled: boolean("guard_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type FocusProfile = typeof focusProfilesTable.$inferSelect;
export type InsertFocusProfile = typeof focusProfilesTable.$inferInsert;
