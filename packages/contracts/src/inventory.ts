import { z } from 'zod';

// ============================================================================
// Asset Contracts
// ============================================================================

export const AssetType = {
  VIDEO: 'VIDEO',
} as const;

export const knownAssetTypeSchema = z.enum(['VIDEO']);
export type KnownAssetType = z.infer<typeof knownAssetTypeSchema>;

/**
 * Extensible AssetType: allows known types like VIDEO and future types
 * (e.g. SUBTITLE, AUDIO, NFO, POSTER) without schema breakages.
 */
export const assetTypeSchema = z.string().min(1);
export type AssetType = z.infer<typeof assetTypeSchema>;

export const assetSchema = z.object({
  id: z.string().min(1),
  mediaItemId: z.string().min(1),
  type: assetTypeSchema,
  path: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  mtime: z.coerce.date(),
  present: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Asset = z.infer<typeof assetSchema>;

export const createAssetInputSchema = z.object({
  id: z.string().min(1).optional(),
  mediaItemId: z.string().min(1),
  type: assetTypeSchema.default(AssetType.VIDEO),
  path: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  mtime: z.coerce.date(),
  present: z.boolean().default(true),
});
export type CreateAssetInput = z.infer<typeof createAssetInputSchema>;

export const updateAssetInputSchema = z.object({
  mediaItemId: z.string().min(1).optional(),
  type: assetTypeSchema.optional(),
  path: z.string().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  mtime: z.coerce.date().optional(),
  present: z.boolean().optional(),
});
export type UpdateAssetInput = z.infer<typeof updateAssetInputSchema>;

// ============================================================================
// Movie Contracts
// ============================================================================

export const movieSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  originalTitle: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  runtimeMinutes: z.number().int().positive().nullable().optional(),
  overview: z.string().nullable().optional(),
  tmdbId: z.number().int().positive().nullable().optional(),
  imdbId: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Movie = z.infer<typeof movieSchema>;

export const createMovieInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  originalTitle: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  runtimeMinutes: z.number().int().positive().nullable().optional(),
  overview: z.string().nullable().optional(),
  tmdbId: z.number().int().positive().nullable().optional(),
  imdbId: z.string().nullable().optional(),
});
export type CreateMovieInput = z.infer<typeof createMovieInputSchema>;

export const updateMovieInputSchema = z.object({
  title: z.string().min(1).optional(),
  originalTitle: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  runtimeMinutes: z.number().int().positive().nullable().optional(),
  overview: z.string().nullable().optional(),
  tmdbId: z.number().int().positive().nullable().optional(),
  imdbId: z.string().nullable().optional(),
});
export type UpdateMovieInput = z.infer<typeof updateMovieInputSchema>;

// ============================================================================
// MediaItem Contracts
// ============================================================================

export const mediaItemStatusSchema = z.enum([
  'UNMATCHED',
  'MATCHED',
  'REVIEW_REQUIRED',
  'ORGANIZED',
  'ERROR',
]);
export type MediaItemStatus = z.infer<typeof mediaItemStatusSchema>;

export const mediaItemSchema = z.object({
  id: z.string().min(1),
  movieId: z.string().nullable().optional(),
  status: mediaItemStatusSchema,
  matchConfidence: z.number().min(0).max(1).nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type MediaItem = z.infer<typeof mediaItemSchema>;

export const mediaItemWithAssetsSchema = mediaItemSchema.extend({
  assets: z.array(assetSchema),
  movie: movieSchema.nullable().optional(),
});
export type MediaItemWithAssets = z.infer<typeof mediaItemWithAssetsSchema>;

export const createMediaItemInputSchema = z.object({
  id: z.string().min(1).optional(),
  movieId: z.string().nullable().optional(),
  status: mediaItemStatusSchema.default('UNMATCHED'),
  matchConfidence: z.number().min(0).max(1).nullable().optional(),
});
export type CreateMediaItemInput = z.infer<typeof createMediaItemInputSchema>;

export const updateMediaItemInputSchema = z.object({
  movieId: z.string().nullable().optional(),
  status: mediaItemStatusSchema.optional(),
  matchConfidence: z.number().min(0).max(1).nullable().optional(),
});
export type UpdateMediaItemInput = z.infer<typeof updateMediaItemInputSchema>;

// ============================================================================
// Scan Contracts
// ============================================================================

export const scanStatusSchema = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']);
export type ScanStatus = z.infer<typeof scanStatusSchema>;

export const scanSchema = z.object({
  id: z.string().min(1),
  rootPath: z.string().min(1),
  status: scanStatusSchema,
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable().optional(),
  discoveredCount: z.number().int().nonnegative(),
  createdCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Scan = z.infer<typeof scanSchema>;

export const createScanInputSchema = z.object({
  id: z.string().min(1).optional(),
  rootPath: z.string().min(1),
  status: scanStatusSchema.default('RUNNING'),
});
export type CreateScanInput = z.infer<typeof createScanInputSchema>;

export const completeScanInputSchema = z.object({
  discoveredCount: z.number().int().nonnegative().optional(),
  createdCount: z.number().int().nonnegative().optional(),
  updatedCount: z.number().int().nonnegative().optional(),
  failedCount: z.number().int().nonnegative().optional(),
});
export type CompleteScanInput = z.infer<typeof completeScanInputSchema>;

export const failScanInputSchema = z.object({
  errorMessage: z.string().min(1),
  discoveredCount: z.number().int().nonnegative().optional(),
  createdCount: z.number().int().nonnegative().optional(),
  updatedCount: z.number().int().nonnegative().optional(),
  failedCount: z.number().int().nonnegative().optional(),
});
export type FailScanInput = z.infer<typeof failScanInputSchema>;
