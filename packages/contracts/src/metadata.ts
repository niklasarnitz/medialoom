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
  evaluations: z.array(z.lazy(() => candidateMatchEvaluationSchema)).optional(),
});
export type CandidatesEnvelope = z.infer<typeof candidatesEnvelopeSchema>;

// ============================================================================
// Movie Matching Contracts
// ============================================================================

export const matchDecisionSchema = z.enum(['AUTO_MATCH', 'REVIEW_REQUIRED', 'UNMATCHED']);
export type MatchDecision = z.infer<typeof matchDecisionSchema>;

export const scoreComponentsSchema = z.object({
  title: z.number(),
  year: z.number(),
  runtime: z.number(),
  providerRank: z.number(),
  penalty: z.number().default(0),
});
export type ScoreComponents = z.infer<typeof scoreComponentsSchema>;

export const candidateMatchEvaluationSchema = z.object({
  candidate: movieMetadataCandidateSchema,
  score: z.number(),
  components: scoreComponentsSchema,
  rank: z.number(),
  reasons: z.array(z.string()),
});
export type CandidateMatchEvaluation = z.infer<typeof candidateMatchEvaluationSchema>;

export const itemMatchResultSchema = z.object({
  itemId: z.string().min(1),
  decision: matchDecisionSchema,
  score: z.number().nullable(),
  components: scoreComponentsSchema.nullable().optional(),
  selectedCandidate: movieMetadataCandidateSchema.nullable().optional(),
  evaluations: z.array(candidateMatchEvaluationSchema),
  isManual: z.boolean().default(false),
});
export type ItemMatchResult = z.infer<typeof itemMatchResultSchema>;

export const matchEnvelopeSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  itemId: z.string().min(1),
  decision: matchDecisionSchema,
  score: z.number().nullable().optional(),
  components: scoreComponentsSchema.nullable().optional(),
  matched: z.boolean(),
  isManual: z.boolean().default(false),
  candidate: movieMetadataCandidateSchema.nullable().optional(),
  evaluations: z.array(candidateMatchEvaluationSchema).optional(),
});
export type MatchEnvelope = z.infer<typeof matchEnvelopeSchema>;

export const systemSettingEnvelopeSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  key: z.string().min(1),
  value: z.string().nullable(),
  masked: z.boolean().default(false),
  configured: z.boolean().default(false),
});
export type SystemSettingEnvelope = z.infer<typeof systemSettingEnvelopeSchema>;
