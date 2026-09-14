import { z } from 'zod';

// ============================================================================
// Output Profile & Layout Contracts
// ============================================================================

export const sidecarPlanSchema = z.object({
  filename: z.string().min(1),
  type: z.string().min(1),
  relativePath: z.string().min(1),
  destinationPath: z.string().min(1),
  content: z.string(),
});
export type SidecarPlan = z.infer<typeof sidecarPlanSchema>;

export const movieLayoutPlanSchema = z.object({
  profile: z.string().min(1),
  destinationRoot: z.string().min(1),
  directory: z.string().min(1),
  destinationDirectory: z.string().min(1),
  mediaFilename: z.string().min(1),
  relativeMediaPath: z.string().min(1),
  destinationMediaPath: z.string().min(1),
  sourceMediaPath: z.string().nullable().optional(),
  sidecars: z.array(sidecarPlanSchema),
});
export type MovieLayoutPlan = z.infer<typeof movieLayoutPlanSchema>;

export const layoutDataSchema = z.object({
  itemId: z.string().min(1),
  profile: z.string().min(1),
  plan: movieLayoutPlanSchema,
});
export type LayoutData = z.infer<typeof layoutDataSchema>;

export const layoutEnvelopeSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  command: z.string().default('layout'),
  status: z.literal('success').default('success'),
  data: layoutDataSchema,
});
export type LayoutEnvelope = z.infer<typeof layoutEnvelopeSchema>;
