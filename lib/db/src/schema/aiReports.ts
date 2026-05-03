import {
  pgTable,
  serial,
  text,
  timestamp,
  jsonb,
  integer,
  doublePrecision,
} from "drizzle-orm/pg-core";

export type RigorReportJson = {
  overallScore: number;
  logicScore: number;
  methodologyScore: number;
  citationsScore: number;
  falsifiabilityScore: number;
  noveltyScore: number;
  critique: string;
  strengths: string[];
  weaknesses: string[];
};

export type AiSurveyPassJson = {
  persona: string;
  verdict: "endorse" | "mixed" | "reject";
  confidence: number;
  rationale: string;
};

export type AiSurveyJson = {
  confidence: number;
  consensus: string;
  passes: AiSurveyPassJson[];
};

export const aiReportsTable = pgTable("ai_reports", {
  id: serial("id").primaryKey(),
  paperId: integer("paper_id").notNull(),
  revisionNumber: integer("revision_number").notNull().default(0),
  rigor: jsonb("rigor").$type<RigorReportJson>().notNull(),
  survey: jsonb("survey").$type<AiSurveyJson>().notNull(),
  rigorScore: doublePrecision("rigor_score").notNull(),
  surveyConfidence: doublePrecision("survey_confidence").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiReport = typeof aiReportsTable.$inferSelect;
export type InsertAiReport = typeof aiReportsTable.$inferInsert;
