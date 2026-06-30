import {
  pgTable,
  serial,
  text,
  integer,
  date,
  timestamp,
} from "drizzle-orm/pg-core";

export type IntegrityEventType =
  | "retraction"
  | "correction"
  | "expression_of_concern"
  | "pubpeer_flag";

// Integrity signal attached to a work (retraction / correction / EoC / PubPeer flag).
export const riIntegrityEventsTable = pgTable("ri_integrity_events", {
  id: serial("id").primaryKey(),
  workId: integer("work_id").notNull(),
  eventType: text("event_type").$type<IntegrityEventType>().notNull(),
  reason: text("reason"),
  source: text("source"),
  eventDate: date("event_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type RiIntegrityEvent = typeof riIntegrityEventsTable.$inferSelect;
export type InsertRiIntegrityEvent = typeof riIntegrityEventsTable.$inferInsert;
