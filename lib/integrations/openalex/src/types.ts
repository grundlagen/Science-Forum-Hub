import { z } from "zod";

export const openalexInstitutionSchema = z
  .object({
    id: z.string().nullish(),
    ror: z.string().nullish(),
    display_name: z.string().nullish(),
    country_code: z.string().nullish(),
  })
  .passthrough();

export const openalexAuthorRefSchema = z
  .object({
    id: z.string().nullish(),
    orcid: z.string().nullish(),
    display_name: z.string().nullish(),
  })
  .passthrough();

export const openalexAuthorshipSchema = z
  .object({
    author_position: z.string().nullish(),
    author: openalexAuthorRefSchema,
    institutions: z.array(openalexInstitutionSchema).nullish(),
  })
  .passthrough();

export const openalexGrantSchema = z
  .object({
    funder: z.string().nullish(),
    funder_display_name: z.string().nullish(),
    award_id: z.string().nullish(),
  })
  .passthrough();

export const openalexWorkSchema = z
  .object({
    id: z.string().nullish(),
    doi: z.string().nullish(),
    title: z.string().nullish(),
    publication_date: z.string().nullish(),
    is_retracted: z.boolean().nullish(),
    ids: z
      .object({ pmid: z.string().nullish(), pmcid: z.string().nullish() })
      .passthrough()
      .nullish(),
    authorships: z.array(openalexAuthorshipSchema).nullish(),
    grants: z.array(openalexGrantSchema).nullish(),
  })
  .passthrough();

export const openalexWorksResponseSchema = z
  .object({
    results: z.array(openalexWorkSchema).nullish(),
    meta: z.object({ count: z.number().nullish() }).passthrough().nullish(),
  })
  .passthrough();

// Authors search.
export const openalexAuthorSchema = z
  .object({
    id: z.string().nullish(),
    orcid: z.string().nullish(),
    display_name: z.string().nullish(),
    works_count: z.number().nullish(),
  })
  .passthrough();

export const openalexAuthorsResponseSchema = z
  .object({
    results: z.array(openalexAuthorSchema).nullish(),
    meta: z.object({ count: z.number().nullish() }).passthrough().nullish(),
  })
  .passthrough();

// Funder lookup (for funder country resolution).
export const openalexFunderSchema = z
  .object({
    id: z.string().nullish(),
    display_name: z.string().nullish(),
    country_code: z.string().nullish(),
  })
  .passthrough();

export type OpenAlexInstitution = z.infer<typeof openalexInstitutionSchema>;
export type OpenAlexWork = z.infer<typeof openalexWorkSchema>;
export type OpenAlexWorksResponse = z.infer<typeof openalexWorksResponseSchema>;
export type OpenAlexAuthor = z.infer<typeof openalexAuthorSchema>;
export type OpenAlexAuthorsResponse = z.infer<typeof openalexAuthorsResponseSchema>;
export type OpenAlexFunder = z.infer<typeof openalexFunderSchema>;
