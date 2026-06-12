import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import type { FocusLockMode } from "./focusSessions";

export const focusSettingsTable = pgTable("focus_settings", {
  userId: text("user_id").primaryKey(),
  defaultMinutes: integer("default_minutes").notNull().default(25),
  defaultLockMode: text("default_lock_mode").$type<FocusLockMode>().notNull().default("gentle"),
  weeklyTargetMinutes: integer("weekly_target_minutes").notNull().default(90),
  quietFeed: boolean("quiet_feed").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type FocusSettings = typeof focusSettingsTable.$inferSelect;
export type InsertFocusSettings = typeof focusSettingsTable.$inferInsert;
