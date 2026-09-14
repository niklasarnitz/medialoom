import { z } from 'zod';

// ============================================================================
// Movie Metadata Provider Contracts
// ============================================================================

export const movieSearchQuerySchema = z.object({
  query: z.string().min(1),
  year: z.number().int().optional(),
  language: z.string().optional(),
});
export type MovieSearchQuery = z.infer<typeof movieSearchQuerySchema>;

export const movieMetadataCandidateSchema = z.object({
  provider: z.string().min(1),
  providerId: z.string().min(1),
  title: z.string().min(1),
  originalTitle: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  runtimeMinutes: z.number().int().positive().nullable().optional(),
  overview: z.string().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  posterUrl: z.string().nullable().optional(),
  tmdbId: z.number().int().positive().nullable().optional(),
  imdbId: z.string().nullable().optional(),
  rawPayload: z.record(z.unknown()).optional(),
});
export type MovieMetadataCandidate = z.infer<typeof movieMetadataCandidateSchema>;

export const candidatesEnvelopeSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  itemId: z.string().min(1),
  query: z.string(),
  year: z.number().int().nullable().optional(),
  candidates: z.array(movieMetadataCandidateSchema),
});
export type CandidatesEnvelope = z.infer<typeof candidatesEnvelopeSchema>;

export const systemSettingEnvelopeSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  key: z.string().min(1),
  value: z.string().nullable(),
  masked: z.boolean().default(false),
  configured: z.boolean().default(false),
});
export type SystemSettingEnvelope = z.infer<typeof systemSettingEnvelopeSchema>;
