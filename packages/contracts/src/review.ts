import { z } from 'zod';
import { operationPlanDtoSchema, planValidationResultSchema } from './plan';

// ============================================================================
// Review Item Enums
// ============================================================================

export const reviewItemTypeSchema = z.enum([
  'FILESYSTEM_CHANGE',
  'MATCH_REVIEW',
  'EDITION_REVIEW',
  'METADATA_CHANGE',
  'DUPLICATE_REVIEW',
]);
export type ReviewItemType = z.infer<typeof reviewItemTypeSchema>;

export const reviewItemStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'APPLIED',
  'FAILED',
]);
export type ReviewItemStatus = z.infer<typeof reviewItemStatusSchema>;

// ============================================================================
// Structured Display Data Schemas
// ============================================================================

export const reviewAffectedMovieSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  year: z.number().int().nullable().optional(),
  status: z.string().optional(),
});
export type ReviewAffectedMovie = z.infer<typeof reviewAffectedMovieSchema>;

export const reviewProposedMoveSchema = z.object({
  source: z.string().min(1),
  destination: z.string().min(1),
  versionLabel: z.string().optional(),
  edition: z.string().optional(),
});
export type ReviewProposedMove = z.infer<typeof reviewProposedMoveSchema>;

export const reviewProposedWriteSchema = z.object({
  path: z.string().min(1),
  filename: z.string().min(1),
  type: z.string().optional(),
  sizeChars: z.number().int().nonnegative().optional(),
});
export type ReviewProposedWrite = z.infer<typeof reviewProposedWriteSchema>;

export const reviewProposedDirectorySchema = z.object({
  path: z.string().min(1),
});
export type ReviewProposedDirectory = z.infer<typeof reviewProposedDirectorySchema>;

export const reviewItemDetailsSchema = z.object({
  affectedMovie: reviewAffectedMovieSchema.optional(),
  reason: z.string().min(1),
  destinationRoot: z.string().min(1),
  directoriesToCreate: z.array(reviewProposedDirectorySchema).default([]),
  filesToMove: z.array(reviewProposedMoveSchema).default([]),
  filesToWrite: z.array(reviewProposedWriteSchema).default([]),
  versionNamingChanges: z.array(z.string()).default([]),
  validation: planValidationResultSchema.nullable().optional(),
  warnings: z.array(z.string()).default([]),
  conflicts: z.array(z.string()).default([]),
});
export type ReviewItemDetails = z.infer<typeof reviewItemDetailsSchema>;

// ============================================================================
// ReviewQueueItem DTO
// ============================================================================

export const reviewQueueItemDtoSchema = z.object({
  id: z.string().min(1),
  type: reviewItemTypeSchema,
  status: reviewItemStatusSchema,
  mediaItemId: z.string().nullable().optional(),
  operationPlanId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  details: reviewItemDetailsSchema.nullable().optional(),
  plan: operationPlanDtoSchema.nullable().optional(),
  createdAt: z.coerce.date(),
  reviewedAt: z.coerce.date().nullable().optional(),
  approvedAt: z.coerce.date().nullable().optional(),
  rejectedAt: z.coerce.date().nullable().optional(),
  updatedAt: z.coerce.date().optional(),
});
export type ReviewQueueItemDto = z.infer<typeof reviewQueueItemDtoSchema>;

// ============================================================================
// Query & Request Schemas
// ============================================================================

export const listReviewQuerySchema = z.object({
  mediaItemId: z.string().optional(),
  operationPlanId: z.string().optional(),
  status: reviewItemStatusSchema.optional(),
  type: reviewItemTypeSchema.optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});
export type ListReviewQuery = z.infer<typeof listReviewQuerySchema>;

export const reviewActionResponseSchema = z.object({
  item: reviewQueueItemDtoSchema,
  action: z.enum(['APPROVED', 'REJECTED', 'APPLIED']),
  message: z.string().min(1),
});
export type ReviewActionResponse = z.infer<typeof reviewActionResponseSchema>;
