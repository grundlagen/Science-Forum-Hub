import {
  pgTable,
  serial,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type WorkGrantLinkSource = "exporter" | "pubmed" | "reporter" | "acknowledgment";

// Authorship edge (researcher -> work).
export const riResearcherWorksTable = pgTable(
  "ri_researcher_works",
  {
    id: serial("id").primaryKey(),
    researcherId: integer("researcher_id").notNull(),
    workId: integer("work_id").notNull(),
    authorPosition: text("author_position"),
  },
  (t) => ({
    unique: uniqueIndex("ri_researcher_works_unique").on(t.researcherId, t.workId),
  }),
);
export type RiResearcherWork = typeof riResearcherWorksTable.$inferSelect;
export type InsertRiResearcherWork = typeof riResearcherWorksTable.$inferInsert;

// Funding edge (work -> grant). The legally decisive linkage; link_source records
// which corroborating source produced it (>=2 sources => higher confidence).
export const riWorkGrantsTable = pgTable(
  "ri_work_grants",
  {
    id: serial("id").primaryKey(),
    workId: integer("work_id").notNull(),
    grantId: integer("grant_id").notNull(),
    linkSource: text("link_source").$type<WorkGrantLinkSource>().notNull(),
  },
  (t) => ({
    unique: uniqueIndex("ri_work_grants_unique").on(t.workId, t.grantId, t.linkSource),
  }),
);
export type RiWorkGrant = typeof riWorkGrantsTable.$inferSelect;
export type InsertRiWorkGrant = typeof riWorkGrantsTable.$inferInsert;

// Time-bounded affiliation (researcher -> institution).
export const riAffiliationsTable = pgTable(
  "ri_affiliations",
  {
    id: serial("id").primaryKey(),
    researcherId: integer("researcher_id").notNull(),
    institutionId: integer("institution_id").notNull(),
    startYear: integer("start_year"),
    endYear: integer("end_year"),
  },
  (t) => ({
    unique: uniqueIndex("ri_affiliations_unique").on(t.researcherId, t.institutionId),
  }),
);
export type RiAffiliation = typeof riAffiliationsTable.$inferSelect;
export type InsertRiAffiliation = typeof riAffiliationsTable.$inferInsert;
