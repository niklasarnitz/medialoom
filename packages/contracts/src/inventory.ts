import { z } from 'zod';

// ============================================================================
// Asset & Technical Metadata Contracts
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

export const streamTypeSchema = z.enum([
  'VIDEO',
  'AUDIO',
  'SUBTITLE',
  'DATA',
  'ATTACHMENT',
  'OTHER',
]);
export type StreamType = z.infer<typeof streamTypeSchema>;

export const mediaStreamSchema = z.object({
  id: z.string().min(1),
  technicalMetadataId: z.string().min(1),
  index: z.number().int().nonnegative(),
  streamType: z.string().min(1),
  codec: z.string().nullable().optional(),
  codecLongName: z.string().nullable().optional(),
  profile: z.string().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  frameRate: z.number().positive().nullable().optional(),
  bitDepth: z.number().int().positive().nullable().optional(),
  hdrFormat: z.string().nullable().optional(),
  channels: z.number().int().positive().nullable().optional(),
  channelLayout: z.string().nullable().optional(),
  sampleRate: z.number().int().positive().nullable().optional(),
  bitRate: z.union([z.number(), z.bigint()]).nullable().optional(),
  language: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  isDefault: z.boolean().default(false),
  isForced: z.boolean().default(false),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type MediaStream = z.infer<typeof mediaStreamSchema>;

export const createMediaStreamInputSchema = z.object({
  id: z.string().min(1).optional(),
  technicalMetadataId: z.string().min(1).optional(),
  index: z.number().int().nonnegative(),
  streamType: z.string().min(1),
  codec: z.string().nullable().optional(),
  codecLongName: z.string().nullable().optional(),
  profile: z.string().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  frameRate: z.number().positive().nullable().optional(),
  bitDepth: z.number().int().positive().nullable().optional(),
  hdrFormat: z.string().nullable().optional(),
  channels: z.number().int().positive().nullable().optional(),
  channelLayout: z.string().nullable().optional(),
  sampleRate: z.number().int().positive().nullable().optional(),
  bitRate: z.union([z.number(), z.bigint()]).nullable().optional(),
  language: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  isDefault: z.boolean().default(false).optional(),
  isForced: z.boolean().default(false).optional(),
});
export type CreateMediaStreamInput = z.input<typeof createMediaStreamInputSchema>;

export const mediaTechnicalMetadataSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  container: z.string().nullable().optional(),
  formatName: z.string().nullable().optional(),
  durationSeconds: z.number().nonnegative().nullable().optional(),
  bitRate: z.union([z.number(), z.bigint()]).nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  videoCodec: z.string().nullable().optional(),
  frameRate: z.number().positive().nullable().optional(),
  bitDepth: z.number().int().positive().nullable().optional(),
  hdrFormat: z.string().nullable().optional(),
  audioCodec: z.string().nullable().optional(),
  audioChannels: z.number().int().positive().nullable().optional(),
  audioLanguage: z.string().nullable().optional(),
  audioLayout: z.string().nullable().optional(),
  rawJson: z.string().nullable().optional(),
  streams: z.array(mediaStreamSchema).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type MediaTechnicalMetadata = z.infer<typeof mediaTechnicalMetadataSchema>;

export const createMediaTechnicalMetadataInputSchema = z.object({
  id: z.string().min(1).optional(),
  assetId: z.string().min(1),
  container: z.string().nullable().optional(),
  formatName: z.string().nullable().optional(),
  durationSeconds: z.number().nonnegative().nullable().optional(),
  bitRate: z.union([z.number(), z.bigint()]).nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  videoCodec: z.string().nullable().optional(),
  frameRate: z.number().positive().nullable().optional(),
  bitDepth: z.number().int().positive().nullable().optional(),
  hdrFormat: z.string().nullable().optional(),
  audioCodec: z.string().nullable().optional(),
  audioChannels: z.number().int().positive().nullable().optional(),
  audioLanguage: z.string().nullable().optional(),
  audioLayout: z.string().nullable().optional(),
  rawJson: z.string().nullable().optional(),
  streams: z.array(createMediaStreamInputSchema).optional(),
});
export type CreateMediaTechnicalMetadataInput = z.input<
  typeof createMediaTechnicalMetadataInputSchema
>;

export const updateMediaTechnicalMetadataInputSchema = z.object({
  container: z.string().nullable().optional(),
  formatName: z.string().nullable().optional(),
  durationSeconds: z.number().nonnegative().nullable().optional(),
  bitRate: z.union([z.number(), z.bigint()]).nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  videoCodec: z.string().nullable().optional(),
  frameRate: z.number().positive().nullable().optional(),
  bitDepth: z.number().int().positive().nullable().optional(),
  hdrFormat: z.string().nullable().optional(),
  audioCodec: z.string().nullable().optional(),
  audioChannels: z.number().int().positive().nullable().optional(),
  audioLanguage: z.string().nullable().optional(),
  audioLayout: z.string().nullable().optional(),
  rawJson: z.string().nullable().optional(),
  streams: z.array(createMediaStreamInputSchema).optional(),
});
export type UpdateMediaTechnicalMetadataInput = z.input<
  typeof updateMediaTechnicalMetadataInputSchema
>;

// ============================================================================
// Filename-Derived Metadata Contracts (GuessIt)
// ============================================================================

export const mediaFilenameMetadataSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  title: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  type: z.string().nullable().optional(),
  edition: z.string().nullable().optional(),
  screenSize: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  videoCodec: z.string().nullable().optional(),
  audioCodec: z.string().nullable().optional(),
  audioChannels: z.string().nullable().optional(),
  releaseGroup: z.string().nullable().optional(),
  streamingService: z.string().nullable().optional(),
  container: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  rawJson: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type MediaFilenameMetadata = z.infer<typeof mediaFilenameMetadataSchema>;

export const createMediaFilenameMetadataInputSchema = z.object({
  id: z.string().min(1).optional(),
  assetId: z.string().min(1),
  title: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  type: z.string().nullable().optional(),
  edition: z.string().nullable().optional(),
  screenSize: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  videoCodec: z.string().nullable().optional(),
  audioCodec: z.string().nullable().optional(),
  audioChannels: z.string().nullable().optional(),
  releaseGroup: z.string().nullable().optional(),
  streamingService: z.string().nullable().optional(),
  container: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  rawJson: z.string().nullable().optional(),
});
export type CreateMediaFilenameMetadataInput = z.input<
  typeof createMediaFilenameMetadataInputSchema
>;

export const updateMediaFilenameMetadataInputSchema = z.object({
  title: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  type: z.string().nullable().optional(),
  edition: z.string().nullable().optional(),
  screenSize: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  videoCodec: z.string().nullable().optional(),
  audioCodec: z.string().nullable().optional(),
  audioChannels: z.string().nullable().optional(),
  releaseGroup: z.string().nullable().optional(),
  streamingService: z.string().nullable().optional(),
  container: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  rawJson: z.string().nullable().optional(),
});
export type UpdateMediaFilenameMetadataInput = z.input<
  typeof updateMediaFilenameMetadataInputSchema
>;

export const assetSchema = z.object({
  id: z.string().min(1),
  mediaVersionId: z.string().min(1),
  type: assetTypeSchema,
  path: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  mtime: z.coerce.date(),
  present: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Asset = z.infer<typeof assetSchema>;

export const assetWithTechnicalMetadataSchema = assetSchema.extend({
  technicalMetadata: mediaTechnicalMetadataSchema.nullable().optional(),
  filenameMetadata: mediaFilenameMetadataSchema.nullable().optional(),
});
export type AssetWithTechnicalMetadata = z.infer<typeof assetWithTechnicalMetadataSchema>;
export const assetWithMetadataSchema = assetWithTechnicalMetadataSchema;
export type AssetWithMetadata = AssetWithTechnicalMetadata;

export const createAssetInputSchema = z.object({
  id: z.string().min(1).optional(),
  mediaVersionId: z.string().min(1),
  type: assetTypeSchema.default(AssetType.VIDEO),
  path: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  mtime: z.coerce.date(),
  present: z.boolean().default(true),
});
export type CreateAssetInput = z.input<typeof createAssetInputSchema>;
export type CreateAssetOutput = z.output<typeof createAssetInputSchema>;

export const updateAssetInputSchema = z.object({
  mediaVersionId: z.string().min(1).optional(),
  type: assetTypeSchema.optional(),
  path: z.string().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  mtime: z.coerce.date().optional(),
  present: z.boolean().optional(),
});
export type UpdateAssetInput = z.input<typeof updateAssetInputSchema>;

// ============================================================================
// MediaVersion Contracts
// ============================================================================

export const mediaVersionSchema = z.object({
  id: z.string().min(1),
  editionId: z.string().min(1),
  name: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type MediaVersion = z.infer<typeof mediaVersionSchema>;

export const mediaVersionWithAssetsSchema = mediaVersionSchema.extend({
  assets: z.array(assetWithTechnicalMetadataSchema),
});
export type MediaVersionWithAssets = z.infer<typeof mediaVersionWithAssetsSchema>;

export const createMediaVersionInputSchema = z.object({
  id: z.string().min(1).optional(),
  editionId: z.string().min(1),
  name: z.string().nullable().optional(),
});
export type CreateMediaVersionInput = z.input<typeof createMediaVersionInputSchema>;

export const updateMediaVersionInputSchema = z.object({
  name: z.string().nullable().optional(),
});
export type UpdateMediaVersionInput = z.input<typeof updateMediaVersionInputSchema>;

// ============================================================================
// Edition Contracts
// ============================================================================

export const editionSchema = z.object({
  id: z.string().min(1),
  movieId: z.string().min(1),
  name: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Edition = z.infer<typeof editionSchema>;

export const editionWithVersionsSchema = editionSchema.extend({
  mediaVersions: z.array(mediaVersionWithAssetsSchema),
});
export type EditionWithVersions = z.infer<typeof editionWithVersionsSchema>;

export const createEditionInputSchema = z.object({
  id: z.string().min(1).optional(),
  movieId: z.string().min(1),
  name: z.string().nullable().optional(),
});
export type CreateEditionInput = z.input<typeof createEditionInputSchema>;

export const updateEditionInputSchema = z.object({
  movieId: z.string().min(1).optional(),
  name: z.string().nullable().optional(),
});
export type UpdateEditionInput = z.input<typeof updateEditionInputSchema>;

// ============================================================================
// Movie Contracts
// ============================================================================

export const movieStatusSchema = z.enum([
  'UNMATCHED',
  'MATCHED',
  'REVIEW_REQUIRED',
  'ORGANIZED',
  'ERROR',
]);
export type MovieStatus = z.infer<typeof movieStatusSchema>;

export const movieSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  originalTitle: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  runtimeMinutes: z.number().int().positive().nullable().optional(),
  overview: z.string().nullable().optional(),
  status: movieStatusSchema,
  matchConfidence: z.number().min(0).max(1).nullable().optional(),
  matchDetails: z.string().nullable().optional(),
  tmdbId: z.number().int().positive().nullable().optional(),
  imdbId: z.string().nullable().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Movie = z.infer<typeof movieSchema>;

export const movieWithEditionsSchema = movieSchema.extend({
  editions: z.array(editionWithVersionsSchema),
});
export type MovieWithEditions = z.infer<typeof movieWithEditionsSchema>;

export const createMovieInputSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  originalTitle: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  runtimeMinutes: z.number().int().positive().nullable().optional(),
  overview: z.string().nullable().optional(),
  status: movieStatusSchema.default('UNMATCHED'),
  matchConfidence: z.number().min(0).max(1).nullable().optional(),
  matchDetails: z.string().nullable().optional(),
  tmdbId: z.number().int().positive().nullable().optional(),
  imdbId: z.string().nullable().optional(),
});
export type CreateMovieInput = z.input<typeof createMovieInputSchema>;
export type CreateMovieOutput = z.output<typeof createMovieInputSchema>;

export const updateMovieInputSchema = z.object({
  title: z.string().min(1).optional(),
  originalTitle: z.string().nullable().optional(),
  year: z.number().int().nullable().optional(),
  runtimeMinutes: z.number().int().positive().nullable().optional(),
  overview: z.string().nullable().optional(),
  status: movieStatusSchema.optional(),
  matchConfidence: z.number().min(0).max(1).nullable().optional(),
  matchDetails: z.string().nullable().optional(),
  tmdbId: z.number().int().positive().nullable().optional(),
  imdbId: z.string().nullable().optional(),
});
export type UpdateMovieInput = z.input<typeof updateMovieInputSchema>;

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
export type CreateScanInput = z.input<typeof createScanInputSchema>;
export type CreateScanOutput = z.output<typeof createScanInputSchema>;

export const completeScanInputSchema = z.object({
  discoveredCount: z.number().int().nonnegative().optional(),
  createdCount: z.number().int().nonnegative().optional(),
  updatedCount: z.number().int().nonnegative().optional(),
  failedCount: z.number().int().nonnegative().optional(),
});
export type CompleteScanInput = z.input<typeof completeScanInputSchema>;

export const failScanInputSchema = z.object({
  errorMessage: z.string().min(1),
  discoveredCount: z.number().int().nonnegative().optional(),
  createdCount: z.number().int().nonnegative().optional(),
  updatedCount: z.number().int().nonnegative().optional(),
  failedCount: z.number().int().nonnegative().optional(),
});
export type FailScanInput = z.input<typeof failScanInputSchema>;

export const scanResultSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  scanId: z.string().min(1),
  discovered: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type ScanResult = z.infer<typeof scanResultSchema>;

// ============================================================================
// MediaItem Domain Aliases
// ============================================================================

export const mediaItemSchema = movieSchema;
export type MediaItem = Movie;

export const mediaItemWithEditionsSchema = movieWithEditionsSchema;
export type MediaItemWithEditions = MovieWithEditions;
