import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AssetType } from '@medialoom/contracts';
import { PrismaClient } from '@prisma/client';
import { closeDatabaseConnection, getPrismaClient, InventoryRepository } from '../src';

describe('InventoryRepository', () => {
  let repo: InventoryRepository;
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = getPrismaClient();
    repo = new InventoryRepository(prisma);
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  describe('Unmatched MediaItem creation and retrieval', () => {
    it('creates an unmatched MediaItem without a movie and retrieves it', async () => {
      const created = await repo.createMediaItem({
        status: 'UNMATCHED',
      });

      expect(created.id).toBeDefined();
      expect(created.movieId).toBeNull();
      expect(created.status).toBe('UNMATCHED');
      expect(created.matchConfidence).toBeNull();

      const retrieved = await repo.getMediaItem(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.movieId).toBeNull();
      expect(retrieved?.movie).toBeNull();
      expect(retrieved?.assets).toEqual([]);
      expect(retrieved?.status).toBe('UNMATCHED');
    });
  });

  describe('Multiple Assets belonging to one MediaItem', () => {
    it('attaches multiple assets (video and other types) to a single MediaItem', async () => {
      const mediaItem = await repo.createMediaItem({
        status: 'UNMATCHED',
      });

      const videoAsset = await repo.createAsset({
        mediaItemId: mediaItem.id,
        type: AssetType.VIDEO,
        path: `/media/library/movie-part1-${Date.now()}.mkv`,
        sizeBytes: 8_500_000_000,
        mtime: new Date('2024-01-01T12:00:00Z'),
      });

      const videoAsset2 = await repo.createAsset({
        mediaItemId: mediaItem.id,
        type: AssetType.VIDEO,
        path: `/media/library/movie-part2-${Date.now()}.mkv`,
        sizeBytes: 7_800_000_000,
        mtime: new Date('2024-01-01T12:05:00Z'),
      });

      expect(videoAsset.mediaItemId).toBe(mediaItem.id);
      expect(videoAsset2.mediaItemId).toBe(mediaItem.id);
      expect(videoAsset.sizeBytes).toBe(8_500_000_000);

      // Verify via mediaItem lookup
      const retrieved = await repo.getMediaItem(mediaItem.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.assets).toHaveLength(2);
      expect(retrieved?.assets.map((a) => a.id).sort()).toEqual(
        [videoAsset.id, videoAsset2.id].sort(),
      );

      // Verify via getAssetsByMediaItemId
      const assetsList = await repo.getAssetsByMediaItemId(mediaItem.id);
      expect(assetsList).toHaveLength(2);
    });
  });

  describe('Movie existing separately from MediaItem', () => {
    it('creates and retrieves a canonical Movie independently of any MediaItem', async () => {
      const tmdbId = 999000 + Math.floor(Math.random() * 1000);
      const imdbId = `tt${9000000 + Math.floor(Math.random() * 100000)}`;

      const movie = await repo.createMovie({
        title: 'Interstellar',
        originalTitle: 'Interstellar',
        year: 2014,
        runtimeMinutes: 169,
        overview: 'A team of explorers travel through a wormhole in space...',
        tmdbId,
        imdbId,
      });

      expect(movie.id).toBeDefined();
      expect(movie.title).toBe('Interstellar');
      expect(movie.tmdbId).toBe(tmdbId);

      const retrieved = await repo.getMovie(movie.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.title).toBe('Interstellar');
      expect(retrieved?.year).toBe(2014);

      // Can also look up by TMDb ID
      const byTmdb = await repo.findMovieByTmdbId(tmdbId);
      expect(byTmdb).not.toBeNull();
      expect(byTmdb?.id).toBe(movie.id);

      // Can later associate this Movie with a MediaItem
      const mediaItem = await repo.createMediaItem({
        movieId: movie.id,
        status: 'MATCHED',
        matchConfidence: 0.99,
      });

      const itemWithMovie = await repo.getMediaItem(mediaItem.id);
      expect(itemWithMovie?.movieId).toBe(movie.id);
      expect(itemWithMovie?.movie?.title).toBe('Interstellar');
    });
  });

  describe('Scan state transitions', () => {
    it('progresses Scan from RUNNING to COMPLETED with metrics', async () => {
      const scan = await repo.createScan({
        rootPath: '/media/movies',
      });

      expect(scan.id).toBeDefined();
      expect(scan.rootPath).toBe('/media/movies');
      expect(scan.status).toBe('RUNNING');
      expect(scan.completedAt).toBeNull();

      const completed = await repo.completeScan(scan.id, {
        discoveredCount: 42,
        createdCount: 30,
        updatedCount: 10,
        failedCount: 2,
      });

      expect(completed.id).toBe(scan.id);
      expect(completed.status).toBe('COMPLETED');
      expect(completed.completedAt).not.toBeNull();
      expect(completed.discoveredCount).toBe(42);
      expect(completed.createdCount).toBe(30);
      expect(completed.updatedCount).toBe(10);
      expect(completed.failedCount).toBe(2);
    });

    it('progresses Scan from RUNNING to FAILED with error message', async () => {
      const scan = await repo.createScan({
        rootPath: '/media/unreadable',
      });

      const failed = await repo.failScan(scan.id, {
        errorMessage: 'EACCES: permission denied',
        failedCount: 1,
      });

      expect(failed.id).toBe(scan.id);
      expect(failed.status).toBe('FAILED');
      expect(failed.completedAt).not.toBeNull();
      expect(failed.errorMessage).toBe('EACCES: permission denied');
      expect(failed.failedCount).toBe(1);
    });

    it('throws when trying to complete a non-existent scan', async () => {
      await expect(repo.completeScan('non-existent-scan-id')).rejects.toThrow('not found');
    });
  });

  describe('Uniqueness constraints', () => {
    it('enforces uniqueness on Asset path', async () => {
      const mediaItem = await repo.createMediaItem({});
      const uniquePath = `/unique/path/test-${Date.now()}.mp4`;

      await repo.createAsset({
        mediaItemId: mediaItem.id,
        path: uniquePath,
        sizeBytes: 1024,
        mtime: new Date(),
      });

      // Second asset with identical path must fail
      await expect(
        repo.createAsset({
          mediaItemId: mediaItem.id,
          path: uniquePath,
          sizeBytes: 2048,
          mtime: new Date(),
        }),
      ).rejects.toThrow();
    });

    it('enforces uniqueness on Movie tmdbId and imdbId', async () => {
      const tmdbId = 888000 + Math.floor(Math.random() * 1000);
      const imdbId = `tt${8000000 + Math.floor(Math.random() * 100000)}`;

      await repo.createMovie({
        title: 'Original Movie',
        tmdbId,
        imdbId,
      });

      // Duplicate tmdbId must fail
      await expect(
        repo.createMovie({
          title: 'Duplicate TMDb Movie',
          tmdbId,
        }),
      ).rejects.toThrow();

      // Duplicate imdbId must fail
      await expect(
        repo.createMovie({
          title: 'Duplicate IMDb Movie',
          imdbId,
        }),
      ).rejects.toThrow();
    });
  });

  describe('MediaItem listing and filtering', () => {
    it('lists media items with status filter and pagination', async () => {
      const reviewItem = await repo.createMediaItem({
        status: 'REVIEW_REQUIRED',
      });
      const organizedItem = await repo.createMediaItem({
        status: 'ORGANIZED',
      });

      const reviewItems = await repo.listMediaItems({
        status: 'REVIEW_REQUIRED',
      });
      expect(reviewItems.some((i) => i.id === reviewItem.id)).toBe(true);
      expect(reviewItems.every((i) => i.status === 'REVIEW_REQUIRED')).toBe(true);

      const organizedItems = await repo.listMediaItems({
        status: 'ORGANIZED',
      });
      expect(organizedItems.some((i) => i.id === organizedItem.id)).toBe(true);
      expect(organizedItems.every((i) => i.status === 'ORGANIZED')).toBe(true);
    });
  });

  describe('Fresh migration into an empty database', () => {
    it('deploys migrations onto an empty SQLite file and performs repository operations', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'medialoom-db-test-'));
      const tempDbPath = join(tempDir, 'test.db');

      try {
        // Run migrations on fresh database
        execSync('bunx prisma migrate deploy --schema packages/db/prisma/schema.prisma', {
          env: {
            ...process.env,
            DATABASE_URL: `file:${tempDbPath}`,
          },
          stdio: 'pipe',
        });

        // Connect a fresh PrismaClient to the new database
        const freshPrisma = new PrismaClient({
          datasources: {
            db: {
              url: `file:${tempDbPath}`,
            },
          },
        });

        const freshRepo = new InventoryRepository(freshPrisma);

        // Perform repository actions on the fresh database
        const scan = await freshRepo.createScan({ rootPath: '/fresh' });
        expect(scan.status).toBe('RUNNING');

        const item = await freshRepo.createMediaItem({ status: 'UNMATCHED' });
        expect(item.id).toBeDefined();

        const asset = await freshRepo.createAsset({
          mediaItemId: item.id,
          path: '/fresh/file.mp4',
          sizeBytes: 12345,
          mtime: new Date(),
        });
        expect(asset.mediaItemId).toBe(item.id);

        const retrieved = await freshRepo.getMediaItem(item.id);
        expect(retrieved?.assets).toHaveLength(1);

        await freshPrisma.$disconnect();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
