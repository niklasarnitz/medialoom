import {
  type Asset,
  assetSchema,
  type CompleteScanInput,
  type CreateAssetInput,
  type CreateMediaItemInput,
  type CreateMovieInput,
  type CreateScanInput,
  completeScanInputSchema,
  createAssetInputSchema,
  createMediaItemInputSchema,
  createMovieInputSchema,
  createScanInputSchema,
  type FailScanInput,
  failScanInputSchema,
  type MediaItem,
  type MediaItemStatus,
  type MediaItemWithAssets,
  type Movie,
  mediaItemSchema,
  mediaItemWithAssetsSchema,
  movieSchema,
  type Scan,
  scanSchema,
  type UpdateAssetInput,
  type UpdateMediaItemInput,
  type UpdateMovieInput,
  updateAssetInputSchema,
  updateMediaItemInputSchema,
  updateMovieInputSchema,
} from '@medialoom/contracts';
import type {
  Asset as PrismaAsset,
  PrismaClient,
  MediaItem as PrismaMediaItem,
  Movie as PrismaMovie,
  Scan as PrismaScan,
} from '@prisma/client';
import { getPrismaClient } from '../client';

function mapPrismaAssetToDomain(record: PrismaAsset): Asset {
  return assetSchema.parse({
    id: record.id,
    mediaItemId: record.mediaItemId,
    type: record.type,
    path: record.path,
    sizeBytes: Number(record.sizeBytes),
    mtime: record.mtime,
    present: record.present,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function mapPrismaMovieToDomain(record: PrismaMovie): Movie {
  return movieSchema.parse({
    id: record.id,
    title: record.title,
    originalTitle: record.originalTitle,
    year: record.year,
    runtimeMinutes: record.runtimeMinutes,
    overview: record.overview,
    tmdbId: record.tmdbId,
    imdbId: record.imdbId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function mapPrismaMediaItemToDomain(record: PrismaMediaItem): MediaItem {
  return mediaItemSchema.parse({
    id: record.id,
    movieId: record.movieId,
    status: record.status,
    matchConfidence: record.matchConfidence,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

function mapPrismaMediaItemWithRelationsToDomain(
  record: PrismaMediaItem & {
    assets: PrismaAsset[];
    movie: PrismaMovie | null;
  },
): MediaItemWithAssets {
  return mediaItemWithAssetsSchema.parse({
    id: record.id,
    movieId: record.movieId,
    status: record.status,
    matchConfidence: record.matchConfidence,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    assets: record.assets.map(mapPrismaAssetToDomain),
    movie: record.movie ? mapPrismaMovieToDomain(record.movie) : null,
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

export interface ListMediaItemsOptions {
  status?: MediaItemStatus;
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
        tmdbId: input.tmdbId ?? null,
        imdbId: input.imdbId ?? null,
      },
    });
    return mapPrismaMovieToDomain(record);
  }

  async updateMovie(id: string, rawInput: UpdateMovieInput): Promise<Movie> {
    const input = updateMovieInputSchema.parse(rawInput);
    const record = await this.prisma.movie.update({
      where: { id },
      data: input,
    });
    return mapPrismaMovieToDomain(record);
  }

  async getMovie(id: string): Promise<Movie | null> {
    const record = await this.prisma.movie.findUnique({ where: { id } });
    return record ? mapPrismaMovieToDomain(record) : null;
  }

  async findMovieByTmdbId(tmdbId: number): Promise<Movie | null> {
    const record = await this.prisma.movie.findUnique({ where: { tmdbId } });
    return record ? mapPrismaMovieToDomain(record) : null;
  }

  // ==========================================================================
  // MediaItem Operations
  // ==========================================================================

  async createMediaItem(rawInput: CreateMediaItemInput): Promise<MediaItem> {
    const input = createMediaItemInputSchema.parse(rawInput);
    const record = await this.prisma.mediaItem.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        movieId: input.movieId ?? null,
        status: input.status,
        matchConfidence: input.matchConfidence ?? null,
      },
    });
    return mapPrismaMediaItemToDomain(record);
  }

  async updateMediaItem(id: string, rawInput: UpdateMediaItemInput): Promise<MediaItem> {
    const input = updateMediaItemInputSchema.parse(rawInput);
    const record = await this.prisma.mediaItem.update({
      where: { id },
      data: {
        ...(input.movieId !== undefined ? { movieId: input.movieId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.matchConfidence !== undefined ? { matchConfidence: input.matchConfidence } : {}),
      },
    });
    return mapPrismaMediaItemToDomain(record);
  }

  async getMediaItem(id: string): Promise<MediaItemWithAssets | null> {
    const record = await this.prisma.mediaItem.findUnique({
      where: { id },
      include: {
        assets: true,
        movie: true,
      },
    });
    return record ? mapPrismaMediaItemWithRelationsToDomain(record) : null;
  }

  async listMediaItems(options: ListMediaItemsOptions = {}): Promise<MediaItemWithAssets[]> {
    const records = await this.prisma.mediaItem.findMany({
      where: {
        ...(options.status ? { status: options.status } : {}),
      },
      include: {
        assets: true,
        movie: true,
      },
      take: options.limit,
      skip: options.offset,
      orderBy: { createdAt: 'desc' },
    });
    return records.map(mapPrismaMediaItemWithRelationsToDomain);
  }

  // ==========================================================================
  // Asset Operations
  // ==========================================================================

  async createAsset(rawInput: CreateAssetInput): Promise<Asset> {
    const input = createAssetInputSchema.parse(rawInput);
    const record = await this.prisma.asset.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        mediaItemId: input.mediaItemId,
        type: input.type,
        path: input.path,
        sizeBytes: BigInt(input.sizeBytes),
        mtime: input.mtime,
        present: input.present,
      },
    });
    return mapPrismaAssetToDomain(record);
  }

  async updateAsset(id: string, rawInput: UpdateAssetInput): Promise<Asset> {
    const input = updateAssetInputSchema.parse(rawInput);
    const record = await this.prisma.asset.update({
      where: { id },
      data: {
        ...(input.mediaItemId !== undefined ? { mediaItemId: input.mediaItemId } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.path !== undefined ? { path: input.path } : {}),
        ...(input.sizeBytes !== undefined ? { sizeBytes: BigInt(input.sizeBytes) } : {}),
        ...(input.mtime !== undefined ? { mtime: input.mtime } : {}),
        ...(input.present !== undefined ? { present: input.present } : {}),
      },
    });
    return mapPrismaAssetToDomain(record);
  }

  async getAsset(id: string): Promise<Asset | null> {
    const record = await this.prisma.asset.findUnique({ where: { id } });
    return record ? mapPrismaAssetToDomain(record) : null;
  }

  async getAssetByPath(path: string): Promise<Asset | null> {
    const record = await this.prisma.asset.findUnique({ where: { path } });
    return record ? mapPrismaAssetToDomain(record) : null;
  }

  async getAssetsByMediaItemId(mediaItemId: string): Promise<Asset[]> {
    const records = await this.prisma.asset.findMany({
      where: { mediaItemId },
      orderBy: { createdAt: 'asc' },
    });
    return records.map(mapPrismaAssetToDomain);
  }
}

export const defaultInventoryRepository = new InventoryRepository();
