import { z } from "zod";

export const reporterPiSchema = z
  .object({
    profile_id: z.union([z.string(), z.number()]).nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
    full_name: z.string().nullish(),
    is_contact_pi: z.boolean().nullish(),
  })
  .passthrough();

export const reporterOrgSchema = z
  .object({
    org_name: z.string().nullish(),
    org_city: z.string().nullish(),
    org_country: z.string().nullish(),
  })
  .passthrough();

export const reporterProjectSchema = z
  .object({
    appl_id: z.union([z.string(), z.number()]).nullish(),
    project_num: z.string().nullish(),
    core_project_num: z.string().nullish(),
    fiscal_year: z.number().nullish(),
    project_title: z.string().nullish(),
    award_amount: z.number().nullish(),
    project_start_date: z.string().nullish(),
    project_end_date: z.string().nullish(),
    principal_investigators: z.array(reporterPiSchema).nullish(),
    organization: reporterOrgSchema.nullish(),
  })
  .passthrough();

export const projectsResponseSchema = z
  .object({
    meta: z.object({ total: z.number().nullish() }).passthrough().nullish(),
    results: z.array(reporterProjectSchema).nullish(),
  })
  .passthrough();

export type ReporterPi = z.infer<typeof reporterPiSchema>;
export type ReporterProject = z.infer<typeof reporterProjectSchema>;
export type ProjectsResponse = z.infer<typeof projectsResponseSchema>;
