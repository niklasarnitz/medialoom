import { z } from 'zod';
import {
  editionWithVersionsSchema,
  movieStatusSchema,
  movieWithEditionsSchema,
  scanResultSchema,
} from './inventory';
import {
  candidateMatchEvaluationSchema,
  matchDecisionSchema,
  movieMetadataCandidateSchema,
  scoreComponentsSchema,
  systemSettingEnvelopeSchema,
} from './metadata';
import { operationPlanDtoSchema } from './plan';
import { layoutDataSchema } from './profile';
import {
  planExecutionResultDtoSchema,
  reviewActionResponseSchema,
  reviewQueueItemDtoSchema,
} from './review';
import { doctorReportEnvelopeSchema, systemHealthSchema } from './system';

// ============================================================================
// Exit Codes & Error Codes
// ============================================================================

export const ExitCode = {
  SUCCESS: 0,
  GENERIC_FAILURE: 1,
  INVALID_INPUT: 2,
  REVIEW_REQUIRED: 3,
  PROVIDER_ERROR: 4,
  CONFLICT: 5,
} as const;
export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export const ErrorCode = {
  ITEM_NOT_FOUND: 'ITEM_NOT_FOUND',
  EDITION_NOT_FOUND: 'EDITION_NOT_FOUND',
  VERSION_NOT_FOUND: 'VERSION_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  INVALID_CONFIG: 'INVALID_CONFIG',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  UNMATCHED: 'UNMATCHED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  PROVIDER_AUTH_ERROR: 'PROVIDER_AUTH_ERROR',
  PROVIDER_NOT_FOUND: 'PROVIDER_NOT_FOUND',
  PROVIDER_RATE_LIMIT: 'PROVIDER_RATE_LIMIT',
  PROVIDER_NETWORK_ERROR: 'PROVIDER_NETWORK_ERROR',
  CONFLICT: 'CONFLICT',
  SCAN_FAILED: 'SCAN_FAILED',
  REVIEW_NOT_FOUND: 'REVIEW_NOT_FOUND',
  REVIEW_NOT_APPROVED: 'REVIEW_NOT_APPROVED',
  PLAN_NOT_APPROVED: 'PLAN_NOT_APPROVED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ============================================================================
// Error Envelope Contracts
// ============================================================================

export const errorDetailSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;

export const apiErrorEnvelopeSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  status: z.literal('error'),
  error: errorDetailSchema,
});
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;

// ============================================================================
// Generic API & CLI Envelopes
// ============================================================================

export const apiSuccessEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    schemaVersion: z.literal(1).default(1),
    status: z.literal('success'),
    data: dataSchema,
  });

export const cliEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    schemaVersion: z.literal(1).default(1),
    command: z.string().min(1),
    status: z.enum(['success', 'error']),
    data: dataSchema.optional(),
    error: errorDetailSchema.optional(),
  });

// ============================================================================
// API Request DTOs
// ============================================================================

export const createScanRequestSchema = z.object({
  path: z.string().min(1),
});
export type CreateScanRequest = z.infer<typeof createScanRequestSchema>;

export const listItemsQuerySchema = z.object({
  query: z.string().optional(),
  status: movieStatusSchema.optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;

export const matchItemRequestSchema = z.object({
  provider: z.string().optional(),
  providerId: z.union([z.string(), z.number()]).optional(),
  id: z.union([z.string(), z.number()]).optional(),
});
export type MatchItemRequest = z.infer<typeof matchItemRequestSchema>;

export const assignEditionRequestSchema = z.object({
  versionId: z.string().min(1),
  name: z.string().nullable().optional(),
  normalizedName: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  custom: z.boolean().default(false).optional(),
});
export type AssignEditionRequest = z.infer<typeof assignEditionRequestSchema>;

// ============================================================================
// Concrete Response Data Contracts
// ============================================================================

export const scanDataSchema = scanResultSchema;
export type ScanData = z.infer<typeof scanDataSchema>;

export const itemsDataSchema = z.object({
  items: z.array(movieWithEditionsSchema),
});
export type ItemsData = z.infer<typeof itemsDataSchema>;

export const inspectDataSchema = z.object({
  item: movieWithEditionsSchema,
});
export type InspectData = z.infer<typeof inspectDataSchema>;

export const candidatesDataSchema = z.object({
  itemId: z.string().min(1),
  query: z.string(),
  year: z.number().int().nullable().optional(),
  decision: matchDecisionSchema,
  candidates: z.array(movieMetadataCandidateSchema),
  evaluations: z.array(candidateMatchEvaluationSchema),
});
export type CandidatesData = z.infer<typeof candidatesDataSchema>;

export const matchDataSchema = z.object({
  itemId: z.string().min(1),
  decision: matchDecisionSchema,
  score: z.number().nullable().optional(),
  components: scoreComponentsSchema.nullable().optional(),
  matched: z.boolean(),
  isManual: z.boolean().default(false),
  candidate: movieMetadataCandidateSchema.nullable().optional(),
  evaluations: z.array(candidateMatchEvaluationSchema).optional(),
});
export type MatchData = z.infer<typeof matchDataSchema>;

export const editionDataSchema = z.object({
  edition: editionWithVersionsSchema,
});
export type EditionData = z.infer<typeof editionDataSchema>;

export const healthDataSchema = systemHealthSchema;
export type HealthData = z.infer<typeof healthDataSchema>;

export const doctorDataSchema = doctorReportEnvelopeSchema;
export type DoctorData = z.infer<typeof doctorDataSchema>;

export const configDataSchema = systemSettingEnvelopeSchema;
export type ConfigData = z.infer<typeof configDataSchema>;

export const planDataSchema = z.object({
  plan: operationPlanDtoSchema,
});
export type PlanData = z.infer<typeof planDataSchema>;

export const plansDataSchema = z.object({
  plans: z.array(operationPlanDtoSchema),
});
export type PlansData = z.infer<typeof plansDataSchema>;

export const reviewItemDataSchema = z.object({
  item: reviewQueueItemDtoSchema,
});
export type ReviewItemData = z.infer<typeof reviewItemDataSchema>;

export const reviewListDataSchema = z.object({
  items: z.array(reviewQueueItemDtoSchema),
});
export type ReviewListData = z.infer<typeof reviewListDataSchema>;

export const reviewActionDataSchema = reviewActionResponseSchema;
export type ReviewActionData = z.infer<typeof reviewActionDataSchema>;

export const applyReviewDataSchema = planExecutionResultDtoSchema;
export type ApplyReviewData = z.infer<typeof applyReviewDataSchema>;

// Typed Envelopes
export const scanApiEnvelopeSchema = apiSuccessEnvelopeSchema(scanDataSchema);
export const itemsApiEnvelopeSchema = apiSuccessEnvelopeSchema(itemsDataSchema);
export const inspectApiEnvelopeSchema = apiSuccessEnvelopeSchema(inspectDataSchema);
export const candidatesApiEnvelopeSchema = apiSuccessEnvelopeSchema(candidatesDataSchema);
export const matchApiEnvelopeSchema = apiSuccessEnvelopeSchema(matchDataSchema);
export const editionApiEnvelopeSchema = apiSuccessEnvelopeSchema(editionDataSchema);
export const healthApiEnvelopeSchema = apiSuccessEnvelopeSchema(healthDataSchema);
export const layoutApiEnvelopeSchema = apiSuccessEnvelopeSchema(layoutDataSchema);
export const planApiEnvelopeSchema = apiSuccessEnvelopeSchema(planDataSchema);
export const plansApiEnvelopeSchema = apiSuccessEnvelopeSchema(plansDataSchema);
export const reviewItemApiEnvelopeSchema = apiSuccessEnvelopeSchema(reviewItemDataSchema);
export const reviewListApiEnvelopeSchema = apiSuccessEnvelopeSchema(reviewListDataSchema);
export const reviewActionApiEnvelopeSchema = apiSuccessEnvelopeSchema(reviewActionDataSchema);
export const applyReviewApiEnvelopeSchema = apiSuccessEnvelopeSchema(applyReviewDataSchema);
