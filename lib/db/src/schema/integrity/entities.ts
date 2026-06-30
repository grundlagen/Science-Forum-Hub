import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  doublePrecision,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type GrantSource = "nih" | "cordis" | "ukri" | "nsfc" | "nhmrc" | "cihr" | "dfg" | "other";

// Canonical institution (ROR-anchored).
export const riInstitutionsTable = pgTable(
  "ri_institutions",
  {
    id: serial("id").primaryKey(),
    rorId: text("ror_id"),
    openalexId: text("openalex_id"),
    name: text("name").notNull(),
    countryCode: text("country_code"),
    isForeign: boolean("is_foreign").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rorUnique: uniqueIndex("ri_institutions_ror_unique").on(t.rorId),
  }),
);
export type RiInstitution = typeof riInstitutionsTable.$inferSelect;
export type InsertRiInstitution = typeof riInstitutionsTable.$inferInsert;

// Canonical researcher. OpenAlex author id is the resolution spine; ORCID and NIH
// profile id (PPID) are reconciled onto it. match_confidence makes disputed identity
// auditable (a classic FCA defence).
export const riResearchersTable = pgTable(
  "ri_researchers",
  {
    id: serial("id").primaryKey(),
    openalexId: text("openalex_id"),
    orcid: text("orcid"),
    nihPpid: text("nih_ppid"),
    fullName: text("full_name").notNull(),
    matchConfidence: doublePrecision("match_confidence"),
    isPersonalData: boolean("is_personal_data").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    openalexUnique: uniqueIndex("ri_researchers_openalex_unique").on(t.openalexId),
  }),
);
export type RiResearcher = typeof riResearchersTable.$inferSelect;
export type InsertRiResearcher = typeof riResearchersTable.$inferInsert;

// Funder (domestic vs foreign is load-bearing for Pipeline B).
export const riFundersTable = pgTable(
  "ri_funders",
  {
    id: serial("id").primaryKey(),
    crossrefId: text("crossref_id"),
    rorId: text("ror_id"),
    name: text("name").notNull(),
    countryCode: text("country_code"),
    isForeign: boolean("is_foreign").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameUnique: uniqueIndex("ri_funders_name_unique").on(t.name),
  }),
);
export type RiFunder = typeof riFundersTable.$inferSelect;
export type InsertRiFunder = typeof riFundersTable.$inferInsert;

// Grant (NIH or foreign). Keyed by (source, external_id).
export const riGrantsTable = pgTable(
  "ri_grants",
  {
    id: serial("id").primaryKey(),
    source: text("source").$type<GrantSource>().notNull(),
    externalId: text("external_id").notNull(),
    title: text("title"),
    piResearcherId: integer("pi_researcher_id"),
    institutionId: integer("institution_id"),
    funderId: integer("funder_id"),
    isForeignFunder: boolean("is_foreign_funder").notNull().default(false),
    fiscalYear: integer("fiscal_year"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    awardAmount: doublePrecision("award_amount"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceExtUnique: uniqueIndex("ri_grants_source_ext_unique").on(t.source, t.externalId),
  }),
);
export type RiGrant = typeof riGrantsTable.$inferSelect;
export type InsertRiGrant = typeof riGrantsTable.$inferInsert;

// Published work (paper).
export const riWorksTable = pgTable(
  "ri_works",
  {
    id: serial("id").primaryKey(),
    openalexId: text("openalex_id"),
    doi: text("doi"),
    pmid: text("pmid"),
    pmcid: text("pmcid"),
    title: text("title").notNull(),
    publicationDate: date("publication_date"),
    isRetracted: boolean("is_retracted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    openalexUnique: uniqueIndex("ri_works_openalex_unique").on(t.openalexId),
  }),
);
export type RiWork = typeof riWorksTable.$inferSelect;
export type InsertRiWork = typeof riWorksTable.$inferInsert;
