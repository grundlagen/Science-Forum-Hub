import { z } from "zod";

// Semantic Scholar Academic Graph (S2AG) minimal schemas.
// Full field list: https://api.semanticscholar.org/api-docs/graph
// Bulk Datasets (embeddings + full-text passages): https://api.semanticscholar.org/api-docs/datasets

export const s2AuthorRefSchema = z
  .object({
    authorId: z.string().nullish(),
    name: z.string().nullish(),
  })
  .passthrough();

export const s2PaperSchema = z
  .object({
    paperId: z.string(),
    corpusId: z.number().nullish(),
    externalIds: z
      .object({
        DOI: z.string().nullish(),
        PubMed: z.string().nullish(),
        PubMedCentral: z.string().nullish(),
        ArXiv: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    title: z.string().nullish(),
    abstract: z.string().nullish(),
    year: z.number().nullish(),
    authors: z.array(s2AuthorRefSchema).nullish(),
    // SPECTER2 document embedding — present when `fields=embedding.specter_v2` requested.
    embedding: z
      .object({
        model: z.string().nullish(),
        vector: z.array(z.number()),
      })
      .nullish(),
  })
  .passthrough();

export type S2Paper = z.infer<typeof s2PaperSchema>;

export const s2SearchResponseSchema = z.object({
  total: z.number().nullish(),
  offset: z.number().nullish(),
  next: z.number().nullish(),
  data: z.array(s2PaperSchema),
});

export type S2SearchResponse = z.infer<typeof s2SearchResponseSchema>;

// Bulk-datasets release manifest. Each dataset (papers, abstracts, embeddings-specter_v2,
// paper-ids, s2orc, etc.) is downloadable as many gzipped shard URLs.
export const s2DatasetReleaseSchema = z.object({
  release_id: z.string(),
  datasets: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullish(),
      README: z.string().nullish(),
    }),
  ),
});

export const s2DatasetFilesSchema = z.object({
  name: z.string(),
  description: z.string().nullish(),
  files: z.array(z.string()), // pre-signed S3 URLs, valid ~1h
});
