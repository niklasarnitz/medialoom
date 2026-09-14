import { z } from 'zod';

// ============================================================================
// Operation Schemas (Discriminated Union)
// ============================================================================

export const mkdirOperationSchema = z.object({
  id: z.string().optional(),
  type: z.literal('mkdir'),
  path: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type MkdirOperation = z.infer<typeof mkdirOperationSchema>;

export const moveOperationSchema = z.object({
  id: z.string().optional(),
  type: z.literal('move'),
  source: z.string().min(1),
  destination: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type MoveOperation = z.infer<typeof moveOperationSchema>;

export const writeTextOperationSchema = z.object({
  id: z.string().optional(),
  type: z.literal('writeText'),
  path: z.string().min(1),
  content: z.string(),
  metadata: z.record(z.unknown()).optional(),
});
export type WriteTextOperation = z.infer<typeof writeTextOperationSchema>;

export const operationSchema = z.discriminatedUnion('type', [
  mkdirOperationSchema,
  moveOperationSchema,
  writeTextOperationSchema,
]);
export type Operation = z.infer<typeof operationSchema>;

// ============================================================================
// Plan Status & Validation Schemas
// ============================================================================

export const planStatusSchema = z.enum(['PENDING', 'VALIDATED', 'APPLIED', 'FAILED']);
export type PlanStatus = z.infer<typeof planStatusSchema>;

export const validationIssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  code: z.string().min(1),
  message: z.string().min(1),
  operationIndex: z.number().int().nonnegative().optional(),
  path: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const planValidationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(validationIssueSchema),
});
export type PlanValidationResult = z.infer<typeof planValidationResultSchema>;

// ============================================================================
// OperationPlan DTO Schemas
// ============================================================================

export const operationPlanDtoSchema = z.object({
  id: z.string().min(1),
  mediaItemId: z.string().min(1),
  profile: z.string().min(1),
  destinationRoot: z.string().min(1),
  status: planStatusSchema,
  operations: z.array(operationSchema),
  validation: planValidationResultSchema.nullable().optional(),
  failureReason: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  validatedAt: z.coerce.date().nullable().optional(),
  appliedAt: z.coerce.date().nullable().optional(),
  updatedAt: z.coerce.date().optional(),
});
export type OperationPlanDto = z.infer<typeof operationPlanDtoSchema>;

// ============================================================================
// Plan Request Schemas
// ============================================================================

export const createPlanRequestSchema = z.object({
  itemId: z.string().min(1),
  profile: z.string().min(1).optional().default('jellyfin'),
  destination: z.string().min(1),
  validate: z.boolean().optional().default(true),
});
export type CreatePlanInput = z.input<typeof createPlanRequestSchema>;
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;


export const listPlansQuerySchema = z.object({
  mediaItemId: z.string().optional(),
  status: planStatusSchema.optional(),
  limit: z.coerce.number().int().positive().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});
export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;
