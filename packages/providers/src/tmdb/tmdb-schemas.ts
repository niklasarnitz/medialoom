import { z } from 'zod';

// ============================================================================
// TMDb Boundary Schemas
// All external responses must be validated through these boundary schemas.
// Types here are internal to the TMDb provider and must not leak into core.
// ============================================================================

export const tmdbMovieSearchResultItemSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  original_title: z.string().nullable().optional(),
  release_date: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  popularity: z.number().nullable().optional(),
  vote_average: z.number().nullable().optional(),
  vote_count: z.number().nullable().optional(),
});
export type TmdbMovieSearchResultItem = z.infer<typeof tmdbMovieSearchResultItemSchema>;

export const tmdbMovieSearchResponseSchema = z.object({
  page: z.number().int().optional(),
  results: z.array(tmdbMovieSearchResultItemSchema),
  total_pages: z.number().int().optional(),
  total_results: z.number().int().optional(),
});
export type TmdbMovieSearchResponse = z.infer<typeof tmdbMovieSearchResponseSchema>;

export const tmdbExternalIdsSchema = z.object({
  imdb_id: z.string().nullable().optional(),
  wikidata_id: z.string().nullable().optional(),
});

export const tmdbMovieDetailsResponseSchema = z.object({
  id: z.number().int(),
  title: z.string().min(1),
  original_title: z.string().nullable().optional(),
  release_date: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  runtime: z.number().int().nullable().optional(),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  imdb_id: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  external_ids: tmdbExternalIdsSchema.nullable().optional(),
});
export type TmdbMovieDetailsResponse = z.infer<typeof tmdbMovieDetailsResponseSchema>;

export const tmdbErrorResponseSchema = z.object({
  status_code: z.number().optional(),
  status_message: z.string().optional(),
  success: z.boolean().optional(),
});
export type TmdbErrorResponse = z.infer<typeof tmdbErrorResponseSchema>;
