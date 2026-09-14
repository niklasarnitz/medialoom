import type {
  CompleteScanInput,
  CreateAssetInput,
  CreateEditionInput,
  CreateMediaFilenameMetadataInput,
  CreateMediaTechnicalMetadataInput,
  CreateMediaVersionInput,
  CreateMovieInput,
  CreateScanInput,
  FailScanInput,
  MovieStatus,
  UpdateAssetInput,
  UpdateEditionInput,
  UpdateMediaVersionInput,
  UpdateMovieInput,
} from '@medialoom/contracts';
import {
  completeScanInputSchema,
  createAssetInputSchema,
  createEditionInputSchema,
  createMediaFilenameMetadataInputSchema,
  createMediaTechnicalMetadataInputSchema,
  createMediaVersionInputSchema,
  createMovieInputSchema,
  createScanInputSchema,
  failScanInputSchema,
  updateAssetInputSchema,
  updateEditionInputSchema,
  updateMediaVersionInputSchema,
  updateMovieInputSchema,
} from '@medialoom/contracts';
import type {
  Edition,
  MediaFilenameMetadata,
  MediaVersion,
  Movie,
  Prisma,
  PrismaClient,
  Scan,
} from '@prisma/client';
import { getPrismaClient } from '../client';
import { canonicalizeAssetPath } from '../utils/path';

export const technicalMetadataIncludeRelations = {
  streams: {
    orderBy: { index: 'asc' },
  },
} as const;

export const assetIncludeRelations = {
  technicalMetadata: {
    include: technicalMetadataIncludeRelations,
  },
  filenameMetadata: true,
} as const;

export const mediaVersionIncludeHierarchy = {
  assets: {
    include: assetIncludeRelations,
  },
} as const;

export const editionIncludeHierarchy = {
  mediaVersions: {
    include: mediaVersionIncludeHierarchy,
  },
} as const;

export const movieIncludeHierarchy = {
  editions: {
    include: editionIncludeHierarchy,
  },
} as const;

export type MovieWithHierarchy = Prisma.MovieGetPayload<{
  include: typeof movieIncludeHierarchy;
}>;

export type EditionWithHierarchy = Prisma.EditionGetPayload<{
  include: typeof editionIncludeHierarchy;
}>;

export type MediaVersionWithHierarchy = Prisma.MediaVersionGetPayload<{
  include: typeof mediaVersionIncludeHierarchy;
}>;

export type MediaTechnicalMetadataWithStreams = Prisma.MediaTechnicalMetadataGetPayload<{
  include: typeof technicalMetadataIncludeRelations;
}>;

export type AssetWithRelations = Prisma.AssetGetPayload<{
  include: typeof assetIncludeRelations;
}>;

export interface ListMoviesOptions {
  status?: MovieStatus;
  limit?: number;
  offset?: number;
}

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
    return this.prisma.scan.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        rootPath: input.rootPath,
        status: input.status,
        startedAt: new Date(),
      },
    });
  }

  async completeScan(id: string, rawInput?: CompleteScanInput): Promise<Scan> {
    const input = rawInput ? completeScanInputSchema.parse(rawInput) : {};
    const existing = await this.prisma.scan.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Scan with id "${id}" not found`);
    }

    return this.prisma.scan.update({
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
  }

  async failScan(id: string, rawInput: FailScanInput): Promise<Scan> {
    const input = failScanInputSchema.parse(rawInput);
    const existing = await this.prisma.scan.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Scan with id "${id}" not found`);
    }

    return this.prisma.scan.update({
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
  }

  async getScan(id: string): Promise<Scan | null> {
    return this.prisma.scan.findUnique({ where: { id } });
  }

  // ==========================================================================
  // Movie Operations
  // ==========================================================================

  async createMovie(rawInput: CreateMovieInput): Promise<Movie> {
    const input = createMovieInputSchema.parse(rawInput);
    return this.prisma.movie.create({
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
  }

  async updateMovie(id: string, rawInput: UpdateMovieInput): Promise<Movie> {
    const input = updateMovieInputSchema.parse(rawInput);
    return this.prisma.movie.update({
      where: { id },
      data: input,
    });
  }

  async getMovie(id: string): Promise<MovieWithHierarchy | null> {
    return this.prisma.movie.findUnique({
      where: { id },
      include: movieIncludeHierarchy,
    });
  }

  async listMovies(options: ListMoviesOptions = {}): Promise<MovieWithHierarchy[]> {
    return this.prisma.movie.findMany({
      where: {
        ...(options.status ? { status: options.status } : {}),
      },
      include: movieIncludeHierarchy,
      take: options.limit,
      skip: options.offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMovieByTmdbId(tmdbId: number): Promise<MovieWithHierarchy | null> {
    return this.prisma.movie.findUnique({
      where: { tmdbId },
      include: movieIncludeHierarchy,
    });
  }

  // ==========================================================================
  // Edition Operations
  // ==========================================================================

  async createEdition(rawInput: CreateEditionInput): Promise<Edition> {
    const input = createEditionInputSchema.parse(rawInput);
    return this.prisma.edition.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        movieId: input.movieId,
        name: input.name ?? null,
      },
    });
  }

  async updateEdition(id: string, rawInput: UpdateEditionInput): Promise<Edition> {
    const input = updateEditionInputSchema.parse(rawInput);
    return this.prisma.edition.update({
      where: { id },
      data: input,
    });
  }

  async getEdition(id: string): Promise<EditionWithHierarchy | null> {
    return this.prisma.edition.findUnique({
      where: { id },
      include: editionIncludeHierarchy,
    });
  }

  async getEditionsByMovieId(movieId: string): Promise<EditionWithHierarchy[]> {
    return this.prisma.edition.findMany({
      where: { movieId },
      include: editionIncludeHierarchy,
      orderBy: { createdAt: 'asc' },
    });
  }

  // ==========================================================================
  // MediaVersion Operations
  // ==========================================================================

  async createMediaVersion(rawInput: CreateMediaVersionInput): Promise<MediaVersion> {
    const input = createMediaVersionInputSchema.parse(rawInput);
    return this.prisma.mediaVersion.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        editionId: input.editionId,
        name: input.name ?? null,
      },
    });
  }

  async updateMediaVersion(id: string, rawInput: UpdateMediaVersionInput): Promise<MediaVersion> {
    const input = updateMediaVersionInputSchema.parse(rawInput);
    return this.prisma.mediaVersion.update({
      where: { id },
      data: input,
    });
  }

  async getMediaVersion(id: string): Promise<MediaVersionWithHierarchy | null> {
    return this.prisma.mediaVersion.findUnique({
      where: { id },
      include: mediaVersionIncludeHierarchy,
    });
  }

  async getMediaVersionsByEditionId(editionId: string): Promise<MediaVersionWithHierarchy[]> {
    return this.prisma.mediaVersion.findMany({
      where: { editionId },
      include: mediaVersionIncludeHierarchy,
      orderBy: { createdAt: 'asc' },
    });
  }

  // ==========================================================================
  // Asset Operations
  // ==========================================================================

  async createAsset(rawInput: CreateAssetInput): Promise<AssetWithRelations> {
    const input = createAssetInputSchema.parse(rawInput);
    const canonicalPath = canonicalizeAssetPath(input.path);

    return this.prisma.asset.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        mediaVersionId: input.mediaVersionId,
        type: input.type,
        path: canonicalPath,
        sizeBytes: BigInt(input.sizeBytes),
        mtime: input.mtime,
        present: input.present,
      },
      include: assetIncludeRelations,
    });
  }

  async updateAsset(id: string, rawInput: UpdateAssetInput): Promise<AssetWithRelations> {
    const input = updateAssetInputSchema.parse(rawInput);

    return this.prisma.asset.update({
      where: { id },
      data: {
        ...(input.mediaVersionId !== undefined ? { mediaVersionId: input.mediaVersionId } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.path !== undefined ? { path: canonicalizeAssetPath(input.path) } : {}),
        ...(input.sizeBytes !== undefined ? { sizeBytes: BigInt(input.sizeBytes) } : {}),
        ...(input.mtime !== undefined ? { mtime: input.mtime } : {}),
        ...(input.present !== undefined ? { present: input.present } : {}),
      },
      include: assetIncludeRelations,
    });
  }

  async getAsset(id: string): Promise<AssetWithRelations | null> {
    return this.prisma.asset.findUnique({
      where: { id },
      include: assetIncludeRelations,
    });
  }

  async getAssetByPath(rawPath: string): Promise<AssetWithRelations | null> {
    const canonicalPath = canonicalizeAssetPath(rawPath);
    return this.prisma.asset.findUnique({
      where: { path: canonicalPath },
      include: assetIncludeRelations,
    });
  }

  async getAssetsByMediaVersionId(mediaVersionId: string): Promise<AssetWithRelations[]> {
    return this.prisma.asset.findMany({
      where: { mediaVersionId },
      include: assetIncludeRelations,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAssetsByPathPrefix(prefix: string): Promise<AssetWithRelations[]> {
    const canonicalPrefix = canonicalizeAssetPath(prefix);
    return this.prisma.asset.findMany({
      where: {
        path: {
          startsWith: canonicalPrefix,
        },
      },
      include: assetIncludeRelations,
      orderBy: { path: 'asc' },
    });
  }

  // ==========================================================================
  // Technical Metadata Operations (1:1 with Asset)
  // ==========================================================================

  async setTechnicalMetadata(
    rawInput: CreateMediaTechnicalMetadataInput,
  ): Promise<MediaTechnicalMetadataWithStreams> {
    const input = createMediaTechnicalMetadataInputSchema.parse(rawInput);

    return this.prisma.$transaction(async (tx) => {
      const technicalMetadata = await tx.mediaTechnicalMetadata.upsert({
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
          frameRate: input.frameRate ?? null,
          bitDepth: input.bitDepth ?? null,
          hdrFormat: input.hdrFormat ?? null,
          audioCodec: input.audioCodec ?? null,
          audioChannels: input.audioChannels ?? null,
          audioLanguage: input.audioLanguage ?? null,
          audioLayout: input.audioLayout ?? null,
          rawJson: input.rawJson ?? null,
        },
        update: {
          ...(input.container !== undefined ? { container: input.container } : {}),
          ...(input.formatName !== undefined ? { formatName: input.formatName } : {}),
          ...(input.durationSeconds !== undefined
            ? { durationSeconds: input.durationSeconds }
            : {}),
          ...(input.bitRate !== undefined
            ? { bitRate: input.bitRate !== null ? BigInt(input.bitRate) : null }
            : {}),
          ...(input.width !== undefined ? { width: input.width } : {}),
          ...(input.height !== undefined ? { height: input.height } : {}),
          ...(input.videoCodec !== undefined ? { videoCodec: input.videoCodec } : {}),
          ...(input.frameRate !== undefined ? { frameRate: input.frameRate } : {}),
          ...(input.bitDepth !== undefined ? { bitDepth: input.bitDepth } : {}),
          ...(input.hdrFormat !== undefined ? { hdrFormat: input.hdrFormat } : {}),
          ...(input.audioCodec !== undefined ? { audioCodec: input.audioCodec } : {}),
          ...(input.audioChannels !== undefined ? { audioChannels: input.audioChannels } : {}),
          ...(input.audioLanguage !== undefined ? { audioLanguage: input.audioLanguage } : {}),
          ...(input.audioLayout !== undefined ? { audioLayout: input.audioLayout } : {}),
          ...(input.rawJson !== undefined ? { rawJson: input.rawJson } : {}),
        },
      });

      if (input.streams !== undefined) {
        await tx.mediaStream.deleteMany({
          where: { technicalMetadataId: technicalMetadata.id },
        });

        if (input.streams.length > 0) {
          await tx.mediaStream.createMany({
            data: input.streams.map((s) => ({
              ...(s.id ? { id: s.id } : {}),
              technicalMetadataId: technicalMetadata.id,
              index: s.index,
              streamType: s.streamType,
              codec: s.codec ?? null,
              codecLongName: s.codecLongName ?? null,
              profile: s.profile ?? null,
              width: s.width ?? null,
              height: s.height ?? null,
              frameRate: s.frameRate ?? null,
              bitDepth: s.bitDepth ?? null,
              hdrFormat: s.hdrFormat ?? null,
              channels: s.channels ?? null,
              channelLayout: s.channelLayout ?? null,
              sampleRate: s.sampleRate ?? null,
              bitRate: s.bitRate !== undefined && s.bitRate !== null ? BigInt(s.bitRate) : null,
              language: s.language ?? null,
              title: s.title ?? null,
              isDefault: s.isDefault ?? false,
              isForced: s.isForced ?? false,
            })),
          });
        }
      }

      return tx.mediaTechnicalMetadata.findUniqueOrThrow({
        where: { id: technicalMetadata.id },
        include: technicalMetadataIncludeRelations,
      });
    });
  }

  async getTechnicalMetadataByAssetId(
    assetId: string,
  ): Promise<MediaTechnicalMetadataWithStreams | null> {
    return this.prisma.mediaTechnicalMetadata.findUnique({
      where: { assetId },
      include: technicalMetadataIncludeRelations,
    });
  }

  // ==========================================================================
  // Filename Metadata Operations (1:1 with Asset)
  // ==========================================================================

  async setFilenameMetadata(
    rawInput: CreateMediaFilenameMetadataInput,
  ): Promise<MediaFilenameMetadata> {
    const input = createMediaFilenameMetadataInputSchema.parse(rawInput);

    return this.prisma.mediaFilenameMetadata.upsert({
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
  }

  async getFilenameMetadataByAssetId(assetId: string): Promise<MediaFilenameMetadata | null> {
    return this.prisma.mediaFilenameMetadata.findUnique({
      where: { assetId },
    });
  }
}

export const defaultInventoryRepository = new InventoryRepository();
