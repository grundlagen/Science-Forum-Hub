import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export type SignalKind =
  | "foreign_funding_mismatch"
  | "image_duplication"
  | "certification_chain"
  | "data_anomaly"
  | "non_performance";

export type DisclosureState =
  | "internal"
  | "disclosed_to_govt"
  | "filed_under_seal"
  | "public";

// A detector output. Every signal must carry a human-readable reason + structured
// evidence + the detector name (explainability is a FOCUS requirement).
export const riSignalsTable = pgTable("ri_signals", {
  id: serial("id").primaryKey(),
  kind: text("kind").$type<SignalKind>().notNull(),
  subjectResearcherId: integer("subject_researcher_id"),
  subjectWorkId: integer("subject_work_id"),
  subjectGrantId: integer("subject_grant_id"),
  score: doublePrecision("score").notNull(),
  reason: text("reason").notNull(),
  evidence: jsonb("evidence").$type<unknown>().notNull().default({}),
  detector: text("detector").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type RiSignal = typeof riSignalsTable.$inferSelect;
export type InsertRiSignal = typeof riSignalsTable.$inferInsert;

// A candidate case. disclosure_state gates what may be published (default: nothing).
// ftf_owner is the internal first-to-file assignment to prevent reviewer collisions.
export const riCasesTable = pgTable("ri_cases", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  primaryResearcherId: integer("primary_researcher_id"),
  disclosureState: text("disclosure_state").$type<DisclosureState>().notNull().default("internal"),
  ftfOwner: text("ftf_owner"),
  confidence: doublePrecision("confidence"),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type RiCase = typeof riCasesTable.$inferSelect;
export type InsertRiCase = typeof riCasesTable.$inferInsert;
