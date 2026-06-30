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
  // research-integrity signals
  | "foreign_funding_mismatch"
  | "image_duplication"
  | "certification_chain"
  | "data_anomaly"
  | "non_performance"
  // general federal-funding / qui tam signals
  | "debarred_recipient"
  | "excluded_provider"
  | "duplicate_award"
  | "shell_recipient"
  | "set_aside_abuse"
  | "securities_disclosure"
  | "tax_underpayment"
  | "other";

// The fraud domain a signal/case falls under, which maps to whistleblower programs.
export type FraudDomain =
  | "research_grants"
  | "healthcare_billing"
  | "defense_procurement"
  | "ppp_covid_relief"
  | "sba_loans"
  | "customs_tariff"
  | "cybersecurity_compliance"
  | "education_grants"
  | "general_federal_award"
  | "securities"
  | "commodities"
  | "tax"
  | "money_laundering_sanctions";

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
  domain: text("domain").$type<FraudDomain>(),
  subjectName: text("subject_name"),
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
  domain: text("domain").$type<FraudDomain>(),
  program: text("program"),
  estimatedRewardUsd: doublePrecision("estimated_reward_usd"),
  disclosureState: text("disclosure_state").$type<DisclosureState>().notNull().default("internal"),
  ftfOwner: text("ftf_owner"),
  confidence: doublePrecision("confidence"),
  summary: text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
export type RiCase = typeof riCasesTable.$inferSelect;
export type InsertRiCase = typeof riCasesTable.$inferInsert;
