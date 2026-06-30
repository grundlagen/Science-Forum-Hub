import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  date,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// General-funding persistence (the "work-from" database for the non-research domains):
// recipients, awards, and the company-to-company sub-award layer. All ri_-prefixed and
// additive. drizzle-kit push creates them.

export const riRecipientsTable = pgTable(
  "ri_recipients",
  {
    id: serial("id").primaryKey(),
    uei: text("uei"),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    country: text("country"),
    city: text("city"),
    isExcluded: boolean("is_excluded").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ueiUnique: uniqueIndex("ri_recipients_uei_unique").on(t.uei),
  }),
);
export type RiRecipient = typeof riRecipientsTable.$inferSelect;
export type InsertRiRecipient = typeof riRecipientsTable.$inferInsert;

export const riAwardsTable = pgTable(
  "ri_awards",
  {
    id: serial("id").primaryKey(),
    source: text("source").notNull(), // "usaspending" | ...
    awardId: text("award_id").notNull(),
    recipientId: integer("recipient_id"),
    recipientName: text("recipient_name"),
    awardingAgency: text("awarding_agency"),
    amount: doublePrecision("amount"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    category: text("category"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceAwardUnique: uniqueIndex("ri_awards_source_award_unique").on(t.source, t.awardId),
  }),
);
export type RiAward = typeof riAwardsTable.$inferSelect;
export type InsertRiAward = typeof riAwardsTable.$inferInsert;

// Company-to-company: first-tier sub-awards (prime -> sub), the public FSRS/SAM layer.
export const riSubawardsTable = pgTable("ri_subawards", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  primeAwardId: text("prime_award_id"),
  primeRecipientName: text("prime_recipient_name"),
  subRecipientId: integer("sub_recipient_id"),
  subRecipientName: text("sub_recipient_name"),
  amount: doublePrecision("amount"),
  actionDate: date("action_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type RiSubaward = typeof riSubawardsTable.$inferSelect;
export type InsertRiSubaward = typeof riSubawardsTable.$inferInsert;
