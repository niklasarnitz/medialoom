import {
  type AssetWithTechnicalMetadata,
  assetWithTechnicalMetadataSchema,
  type CompleteScanInput,
  type CreateAssetInput,
  type CreateEditionInput,
  type CreateMediaFilenameMetadataInput,
  type CreateMediaTechnicalMetadataInput,
  type CreateMediaVersionInput,
  type CreateMovieInput,
  type CreateScanInput,
  completeScanInputSchema,
  createAssetInputSchema,
  createEditionInputSchema,
  createMediaFilenameMetadataInputSchema,
  createMediaTechnicalMetadataInputSchema,
  createMediaVersionInputSchema,
  createMovieInputSchema,
  createScanInputSchema,
  type Edition,
  type EditionWithVersions,
  editionSchema,
  editionWithVersionsSchema,
  type FailScanInput,
  failScanInputSchema,
  type MediaFilenameMetadata,
  type MediaTechnicalMetadata,
  type MediaVersion,
  type MediaVersionWithAssets,
  type Movie,
  type MovieStatus,
  type MovieWithEditions,
  mediaFilenameMetadataSchema,
  mediaTechnicalMetadataSchema,
  mediaVersionSchema,
  mediaVersionWithAssetsSchema,
  movieSchema,
  movieWithEditionsSchema,
  type Scan,
  scanSchema,
  type UpdateAssetInput,
  type UpdateEditionInput,
  type UpdateMediaFilenameMetadataInput,
  type UpdateMediaVersionInput,
  type UpdateMovieInput,
  updateAssetInputSchema,
  updateEditionInputSchema,
  updateMediaFilenameMetadataInputSchema,
  updateMediaVersionInputSchema,
  updateMovieInputSchema,
} from '@medialoom/contracts';
import type {
  Asset as PrismaAsset,
  PrismaClient,
  Edition as PrismaEdition,
  MediaFilenameMetadata as PrismaMediaFilenameMetadata,
  MediaTechnicalMetadata as PrismaMediaTechnicalMetadata,
  MediaVersion as PrismaMediaVersion,
  Movie as PrismaMovie,
  Scan as PrismaScan,
} from '@prisma/client';
import { getPrismaClient } from '../client';
import { canonicalizeAssetPath } from '../utils/path';

function mapPrismaTechnicalMetadataToDomain(
  record: PrismaMediaTechnicalMetadata,
): MediaTechnicalMetadata {
  return mediaTechnicalMetadataSchema.parse({
    id: record.id,
    assetId: record.assetId,
    container: record.container,
    formatName: record.formatName,
    durationSeconds: record.durationSeconds,
    bitRate: record.bitRate ? Number(record.bitRate) : null,
    width: record.width,
    height: record.height,
    videoCodec: record.videoCodec,
    audioCodec: record.audioCodec,
    audioChannels: record.audioChannels,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function mapPrismaFilenameMetadataToDomain(
  record: PrismaMediaFilenameMetadata,
): MediaFilenameMetadata {
  return mediaFilenameMetadataSchema.parse({
    id: record.id,
    assetId: record.assetId,
    title: record.title,
    year: record.year,
    type: record.type,
    edition: record.edition,
    screenSize: record.screenSize,
    source: record.source,
    videoCodec: record.videoCodec,
    audioCodec: record.audioCodec,
    audioChannels: record.audioChannels,
    releaseGroup: record.releaseGroup,
    streamingService: record.streamingService,
    container: record.container,
    language: record.language,
    rawJson: record.rawJson,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function mapPrismaAssetToDomain(
  record: PrismaAsset & {
    technicalMetadata?: PrismaMediaTechnicalMetadata | null;
    filenameMetadata?: PrismaMediaFilenameMetadata | null;
  },
): AssetWithTechnicalMetadata {
  return assetWithTechnicalMetadataSchema.parse({
    id: record.id,
    mediaVersionId: record.mediaVersionId,
    type: record.type,
    path: record.path,
    sizeBytes: Number(record.sizeBytes),
    mtime: record.mtime,
    present: record.present,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    technicalMetadata: record.technicalMetadata
      ? mapPrismaTechnicalMetadataToDomain(record.technicalMetadata)
      : null,
    filenameMetadata: record.filenameMetadata
      ? mapPrismaFilenameMetadataToDomain(record.filenameMetadata)
      : null,
  });
}

function mapPrismaMediaVersionToDomain(
  record: PrismaMediaVersion & {
    assets?: (PrismaAsset & {
      technicalMetadata?: PrismaMediaTechnicalMetadata | null;
    })[];
  },
): MediaVersionWithAssets {
  return mediaVersionWithAssetsSchema.parse({
    id: record.id,
    editionId: record.editionId,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    assets: (record.assets ?? []).map(mapPrismaAssetToDomain),
  });
}

function mapPrismaEditionToDomain(
  record: PrismaEdition & {
    mediaVersions?: (PrismaMediaVersion & {
      assets?: (PrismaAsset & {
        technicalMetadata?: PrismaMediaTechnicalMetadata | null;
      })[];
    })[];
  },
): EditionWithVersions {
  return editionWithVersionsSchema.parse({
    id: record.id,
    movieId: record.movieId,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    mediaVersions: (record.mediaVersions ?? []).map(mapPrismaMediaVersionToDomain),
  });
}

function mapPrismaMovieToDomain(
  record: PrismaMovie & {
    editions?: (PrismaEdition & {
      mediaVersions?: (PrismaMediaVersion & {
        assets?: (PrismaAsset & {
          technicalMetadata?: PrismaMediaTechnicalMetadata | null;
        })[];
      })[];
    })[];
  },
): MovieWithEditions {
  return movieWithEditionsSchema.parse({
    id: record.id,
    title: record.title,
    originalTitle: record.originalTitle,
    year: record.year,
    runtimeMinutes: record.runtimeMinutes,
    overview: record.overview,
    status: record.status,
    matchConfidence: record.matchConfidence,
    tmdbId: record.tmdbId,
    imdbId: record.imdbId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    editions: (record.editions ?? []).map(mapPrismaEditionToDomain),
  });
}

function mapPrismaScanToDomain(record: PrismaScan): Scan {
  return scanSchema.parse({
    id: record.id,
    rootPath: record.rootPath,
    status: record.status,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    discoveredCount: record.discoveredCount,
    createdCount: record.createdCount,
    updatedCount: record.updatedCount,
    failedCount: record.failedCount,
    errorMessage: record.errorMessage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export interface ListMoviesOptions {
  status?: MovieStatus;
  limit?: number;
  offset?: number;
}

const movieIncludeHierarchy = {
  editions: {
    include: {
      mediaVersions: {
        include: {
          assets: {
            include: {
              technicalMetadata: true,
              filenameMetadata: true,
            },
          },
        },
      },
    },
  },
} as const;

export class InventoryRepository {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? getPrismaClient();
  }

  // ==========================================================================
  // Scan Operations
  // ==========================================================================

  async createScan(rawInput: CreateScanInput): Promise<Scan> {
    const input = createScanInputSchema.parse(rawInput);
    const record = await this.prisma.scan.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        rootPath: input.rootPath,
        status: input.status,
        startedAt: new Date(),
      },
    });
    return mapPrismaScanToDomain(record);
  }

  async completeScan(id: string, rawInput?: CompleteScanInput): Promise<Scan> {
    const input = rawInput ? completeScanInputSchema.parse(rawInput) : {};
    const existing = await this.prisma.scan.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Scan with id "${id}" not found`);
    }

    const record = await this.prisma.scan.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        ...(input.discoveredCount !== undefined ? { discoveredCount: input.discoveredCount } : {}),
        ...(input.createdCount !== undefined ? { createdCount: input.createdCount } : {}),
        ...(input.updatedCount !== undefined ? { updatedCount: input.updatedCount } : {}),
        ...(input.failedCount !== undefined ? { failedCount: input.failedCount } : {}),
      },
    });
    return mapPrismaScanToDomain(record);
  }

  async failScan(id: string, rawInput: FailScanInput): Promise<Scan> {
    const input = failScanInputSchema.parse(rawInput);
    const existing = await this.prisma.scan.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Scan with id "${id}" not found`);
    }

    const record = await this.prisma.scan.update({
      where: { id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage: input.errorMessage,
        ...(input.discoveredCount !== undefined ? { discoveredCount: input.discoveredCount } : {}),
        ...(input.createdCount !== undefined ? { createdCount: input.createdCount } : {}),
        ...(input.updatedCount !== undefined ? { updatedCount: input.updatedCount } : {}),
        ...(input.failedCount !== undefined ? { failedCount: input.failedCount } : {}),
      },
    });
    return mapPrismaScanToDomain(record);
  }

  async getScan(id: string): Promise<Scan | null> {
    const record = await this.prisma.scan.findUnique({ where: { id } });
    return record ? mapPrismaScanToDomain(record) : null;
  }

  // ==========================================================================
  // Movie Operations
  // ==========================================================================

  async createMovie(rawInput: CreateMovieInput): Promise<Movie> {
    const input = createMovieInputSchema.parse(rawInput);
    const record = await this.prisma.movie.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        title: input.title,
        originalTitle: input.originalTitle ?? null,
        year: input.year ?? null,
        runtimeMinutes: input.runtimeMinutes ?? null,
        overview: input.overview ?? null,
        status: input.status,
        matchConfidence: input.matchConfidence ?? null,
        tmdbId: input.tmdbId ?? null,
        imdbId: input.imdbId ?? null,
      },
    });
    return movieSchema.parse(record);
  }

  async updateMovie(id: string, rawInput: UpdateMovieInput): Promise<Movie> {
    const input = updateMovieInputSchema.parse(rawInput);
    const record = await this.prisma.movie.update({
      where: { id },
      data: input,
    });
    return movieSchema.parse(record);
  }

  async getMovie(id: string): Promise<MovieWithEditions | null> {
    const record = await this.prisma.movie.findUnique({
      where: { id },
      include: movieIncludeHierarchy,
    });
    return record ? mapPrismaMovieToDomain(record) : null;
  }

  async listMovies(options: ListMoviesOptions = {}): Promise<MovieWithEditions[]> {
    const records = await this.prisma.movie.findMany({
      where: {
        ...(options.status ? { status: options.status } : {}),
      },
      include: movieIncludeHierarchy,
      take: options.limit,
      skip: options.offset,
      orderBy: { createdAt: 'desc' },
    });
    return records.map(mapPrismaMovieToDomain);
  }

  async findMovieByTmdbId(tmdbId: number): Promise<MovieWithEditions | null> {
    const record = await this.prisma.movie.findUnique({
      where: { tmdbId },
      include: movieIncludeHierarchy,
    });
    return record ? mapPrismaMovieToDomain(record) : null;
  }

  // ==========================================================================
  // Edition Operations
  // ==========================================================================

  async createEdition(rawInput: CreateEditionInput): Promise<Edition> {
    const input = createEditionInputSchema.parse(rawInput);
    const record = await this.prisma.edition.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        movieId: input.movieId,
        name: input.name ?? null,
      },
    });
    return editionSchema.parse(record);
  }

  async updateEdition(id: string, rawInput: UpdateEditionInput): Promise<Edition> {
    const input = updateEditionInputSchema.parse(rawInput);
    const record = await this.prisma.edition.update({
      where: { id },
      data: input,
    });
    return editionSchema.parse(record);
  }

  async getEdition(id: string): Promise<EditionWithVersions | null> {
    const record = await this.prisma.edition.findUnique({
      where: { id },
      include: {
        mediaVersions: {
          include: {
            assets: {
              include: {
                technicalMetadata: true,
                filenameMetadata: true,
              },
            },
          },
        },
      },
    });
    return record ? mapPrismaEditionToDomain(record) : null;
  }

  async getEditionsByMovieId(movieId: string): Promise<EditionWithVersions[]> {
    const records = await this.prisma.edition.findMany({
      where: { movieId },
      include: {
        mediaVersions: {
          include: {
            assets: {
              include: {
                technicalMetadata: true,
                filenameMetadata: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return records.map(mapPrismaEditionToDomain);
  }

  // ==========================================================================
  // MediaVersion Operations
  // ==========================================================================

  async createMediaVersion(rawInput: CreateMediaVersionInput): Promise<MediaVersion> {
    const input = createMediaVersionInputSchema.parse(rawInput);
    const record = await this.prisma.mediaVersion.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        editionId: input.editionId,
        name: input.name ?? null,
      },
    });
    return mediaVersionSchema.parse(record);
  }

  async updateMediaVersion(id: string, rawInput: UpdateMediaVersionInput): Promise<MediaVersion> {
    const input = updateMediaVersionInputSchema.parse(rawInput);
    const record = await this.prisma.mediaVersion.update({
      where: { id },
      data: input,
    });
    return mediaVersionSchema.parse(record);
  }

  async getMediaVersion(id: string): Promise<MediaVersionWithAssets | null> {
    const record = await this.prisma.mediaVersion.findUnique({
      where: { id },
      include: {
        assets: {
          include: {
            technicalMetadata: true,
            filenameMetadata: true,
          },
        },
      },
    });
    return record ? mapPrismaMediaVersionToDomain(record) : null;
  }

  async getMediaVersionsByEditionId(editionId: string): Promise<MediaVersionWithAssets[]> {
    const records = await this.prisma.mediaVersion.findMany({
      where: { editionId },
      include: {
        assets: {
          include: {
            technicalMetadata: true,
            filenameMetadata: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return records.map(mapPrismaMediaVersionToDomain);
  }

  // ==========================================================================
  // Asset Operations
  // ==========================================================================

  async createAsset(rawInput: CreateAssetInput): Promise<AssetWithTechnicalMetadata> {
    const input = createAssetInputSchema.parse(rawInput);
    const canonicalPath = canonicalizeAssetPath(input.path);

    const record = await this.prisma.asset.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        mediaVersionId: input.mediaVersionId,
        type: input.type,
        path: canonicalPath,
        sizeBytes: BigInt(input.sizeBytes),
        mtime: input.mtime,
        present: input.present,
      },
      include: {
        technicalMetadata: true,
        filenameMetadata: true,
      },
    });
    return mapPrismaAssetToDomain(record);
  }

  async updateAsset(id: string, rawInput: UpdateAssetInput): Promise<AssetWithTechnicalMetadata> {
    const input = updateAssetInputSchema.parse(rawInput);
    const record = await this.prisma.asset.update({
      where: { id },
      data: {
        ...(input.mediaVersionId !== undefined ? { mediaVersionId: input.mediaVersionId } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.path !== undefined ? { path: canonicalizeAssetPath(input.path) } : {}),
        ...(input.sizeBytes !== undefined ? { sizeBytes: BigInt(input.sizeBytes) } : {}),
        ...(input.mtime !== undefined ? { mtime: input.mtime } : {}),
        ...(input.present !== undefined ? { present: input.present } : {}),
      },
      include: {
        technicalMetadata: true,
        filenameMetadata: true,
      },
    });
    return mapPrismaAssetToDomain(record);
  }

  async getAsset(id: string): Promise<AssetWithTechnicalMetadata | null> {
    const record = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        technicalMetadata: true,
        filenameMetadata: true,
      },
    });
    return record ? mapPrismaAssetToDomain(record) : null;
  }

  async getAssetByPath(rawPath: string): Promise<AssetWithTechnicalMetadata | null> {
    const canonicalPath = canonicalizeAssetPath(rawPath);
    const record = await this.prisma.asset.findUnique({
      where: { path: canonicalPath },
      include: {
        technicalMetadata: true,
        filenameMetadata: true,
      },
    });
    return record ? mapPrismaAssetToDomain(record) : null;
  }

  async getAssetsByMediaVersionId(mediaVersionId: string): Promise<AssetWithTechnicalMetadata[]> {
    const records = await this.prisma.asset.findMany({
      where: { mediaVersionId },
      include: {
        technicalMetadata: true,
        filenameMetadata: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return records.map(mapPrismaAssetToDomain);
  }

  async findAssetsByPathPrefix(prefix: string): Promise<AssetWithTechnicalMetadata[]> {
    const canonicalPrefix = canonicalizeAssetPath(prefix);
    const records = await this.prisma.asset.findMany({
      where: {
        path: {
          startsWith: canonicalPrefix,
        },
      },
      include: {
        technicalMetadata: true,
        filenameMetadata: true,
      },
    });
    return records.map(mapPrismaAssetToDomain);
  }

  // ==========================================================================
  // Technical Metadata Operations (1:1 with Asset)
  // ==========================================================================

  async setTechnicalMetadata(
    rawInput: CreateMediaTechnicalMetadataInput,
  ): Promise<MediaTechnicalMetadata> {
    const input = createMediaTechnicalMetadataInputSchema.parse(rawInput);

    const record = await this.prisma.mediaTechnicalMetadata.upsert({
      where: { assetId: input.assetId },
      create: {
        ...(input.id ? { id: input.id } : {}),
        assetId: input.assetId,
        container: input.container ?? null,
        formatName: input.formatName ?? null,
        durationSeconds: input.durationSeconds ?? null,
        bitRate:
          input.bitRate !== undefined && input.bitRate !== null ? BigInt(input.bitRate) : null,
        width: input.width ?? null,
        height: input.height ?? null,
        videoCodec: input.videoCodec ?? null,
        audioCodec: input.audioCodec ?? null,
        audioChannels: input.audioChannels ?? null,
      },
      update: {
        ...(input.container !== undefined ? { container: input.container } : {}),
        ...(input.formatName !== undefined ? { formatName: input.formatName } : {}),
        ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
        ...(input.bitRate !== undefined
          ? { bitRate: input.bitRate !== null ? BigInt(input.bitRate) : null }
          : {}),
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
        ...(input.videoCodec !== undefined ? { videoCodec: input.videoCodec } : {}),
        ...(input.audioCodec !== undefined ? { audioCodec: input.audioCodec } : {}),
        ...(input.audioChannels !== undefined ? { audioChannels: input.audioChannels } : {}),
      },
    });
    return mapPrismaTechnicalMetadataToDomain(record);
  }

  async getTechnicalMetadataByAssetId(assetId: string): Promise<MediaTechnicalMetadata | null> {
    const record = await this.prisma.mediaTechnicalMetadata.findUnique({
      where: { assetId },
    });
    return record ? mapPrismaTechnicalMetadataToDomain(record) : null;
  }

  // ==========================================================================
  // Filename Metadata Operations (1:1 with Asset)
  // ==========================================================================

  async setFilenameMetadata(
    rawInput: CreateMediaFilenameMetadataInput,
  ): Promise<MediaFilenameMetadata> {
    const input = createMediaFilenameMetadataInputSchema.parse(rawInput);

    const record = await this.prisma.mediaFilenameMetadata.upsert({
      where: { assetId: input.assetId },
      create: {
        ...(input.id ? { id: input.id } : {}),
        assetId: input.assetId,
        title: input.title ?? null,
        year: input.year ?? null,
        type: input.type ?? null,
        edition: input.edition ?? null,
        screenSize: input.screenSize ?? null,
        source: input.source ?? null,
        videoCodec: input.videoCodec ?? null,
        audioCodec: input.audioCodec ?? null,
        audioChannels: input.audioChannels ?? null,
        releaseGroup: input.releaseGroup ?? null,
        streamingService: input.streamingService ?? null,
        container: input.container ?? null,
        language: input.language ?? null,
        rawJson: input.rawJson ?? null,
      },
      update: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.year !== undefined ? { year: input.year } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.edition !== undefined ? { edition: input.edition } : {}),
        ...(input.screenSize !== undefined ? { screenSize: input.screenSize } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.videoCodec !== undefined ? { videoCodec: input.videoCodec } : {}),
        ...(input.audioCodec !== undefined ? { audioCodec: input.audioCodec } : {}),
        ...(input.audioChannels !== undefined ? { audioChannels: input.audioChannels } : {}),
        ...(input.releaseGroup !== undefined ? { releaseGroup: input.releaseGroup } : {}),
        ...(input.streamingService !== undefined
          ? { streamingService: input.streamingService }
          : {}),
        ...(input.container !== undefined ? { container: input.container } : {}),
        ...(input.language !== undefined ? { language: input.language } : {}),
        ...(input.rawJson !== undefined ? { rawJson: input.rawJson } : {}),
      },
    });
    return mapPrismaFilenameMetadataToDomain(record);
  }

  async getFilenameMetadataByAssetId(assetId: string): Promise<MediaFilenameMetadata | null> {
    const record = await this.prisma.mediaFilenameMetadata.findUnique({
      where: { assetId },
    });
    return record ? mapPrismaFilenameMetadataToDomain(record) : null;
  }
}

export const defaultInventoryRepository = new InventoryRepository();

