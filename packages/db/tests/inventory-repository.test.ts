import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize, resolve } from 'node:path';
import { AssetType } from '@medialoom/contracts';
import { PrismaClient } from '@prisma/client';
import {
  canonicalizeAssetPath,
  closeDatabaseConnection,
  getPrismaClient,
  InventoryRepository,
} from '../src';

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

  describe('Unmatched Movie creation and retrieval', () => {
    it('creates an unmatched Movie without TMDb ID and retrieves it', async () => {
      const created = await repo.createMovie({
        title: 'Unmatched Raw Film',
        year: 2021,
        status: 'UNMATCHED',
      });

      expect(created.id).toBeDefined();
      expect(created.title).toBe('Unmatched Raw Film');
      expect(created.tmdbId).toBeNull();
      expect(created.status).toBe('UNMATCHED');
      expect(created.matchConfidence).toBeNull();

      const retrieved = await repo.getMovie(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.status).toBe('UNMATCHED');
      expect(retrieved?.editions).toEqual([]);
    });
  });

  describe('Media Hierarchy (Movie -> Edition -> MediaVersion -> Asset)', () => {
    it('supports one Movie with multiple Editions (Theatrical vs Extended)', async () => {
      const movie = await repo.createMovie({
        title: `The Lord of the Rings: The Fellowship of the Ring (${Date.now()})`,
        year: 2001,
        status: 'MATCHED',
      });

      const theatrical = await repo.createEdition({
        movieId: movie.id,
        name: 'Theatrical Cut',
      });

      const extended = await repo.createEdition({
        movieId: movie.id,
        name: 'Extended Edition',
      });

      expect(theatrical.movieId).toBe(movie.id);
      expect(extended.movieId).toBe(movie.id);

      const movieHierarchy = await repo.getMovie(movie.id);
      expect(movieHierarchy?.editions).toHaveLength(2);
      const names = movieHierarchy?.editions.map((e) => e.name).sort();
      expect(names).toEqual(['Extended Edition', 'Theatrical Cut']);
    });

    it('supports one Edition with multiple MediaVersions (2160p UHD vs 1080p BluRay)', async () => {
      const movie = await repo.createMovie({
        title: `Inception Multi-Version (${Date.now()})`,
        year: 2010,
        status: 'MATCHED',
      });

      const edition = await repo.createEdition({
        movieId: movie.id,
        name: 'Theatrical',
      });

      const ver4k = await repo.createMediaVersion({
        editionId: edition.id,
        name: '2160p UHD BluRay',
      });

      const ver1080p = await repo.createMediaVersion({
        editionId: edition.id,
        name: '1080p BluRay',
      });

      expect(ver4k.editionId).toBe(edition.id);
      expect(ver1080p.editionId).toBe(edition.id);

      const editionWithVersions = await repo.getEdition(edition.id);
      expect(editionWithVersions?.mediaVersions).toHaveLength(2);
      const versionNames = editionWithVersions?.mediaVersions.map((v) => v.name).sort();
      expect(versionNames).toEqual(['1080p BluRay', '2160p UHD BluRay']);
    });

    it('supports one MediaVersion with multiple Assets for CD1/CD2 multipart media', async () => {
      const movie = await repo.createMovie({
        title: `Titanic Multipart (${Date.now()})`,
        year: 1997,
        status: 'MATCHED',
      });

      const edition = await repo.createEdition({
        movieId: movie.id,
      });

      const version = await repo.createMediaVersion({
        editionId: edition.id,
        name: 'DVD Rip',
      });

      const cd1 = await repo.createAsset({
        mediaVersionId: version.id,
        type: AssetType.VIDEO,
        path: `/media/movies/Titanic/Titanic-cd1-${Date.now()}.avi`,
        sizeBytes: 734_000_000,
        mtime: new Date('2000-01-01T00:00:00Z'),
      });

      const cd2 = await repo.createAsset({
        mediaVersionId: version.id,
        type: AssetType.VIDEO,
        path: `/media/movies/Titanic/Titanic-cd2-${Date.now()}.avi`,
        sizeBytes: 734_000_000,
        mtime: new Date('2000-01-01T00:00:00Z'),
      });

      const versionWithAssets = await repo.getMediaVersion(version.id);
      expect(versionWithAssets?.assets).toHaveLength(2);
      expect(versionWithAssets?.assets.map((a) => a.id).sort()).toEqual([cd1.id, cd2.id].sort());
    });
  });

  describe('Asset Path Canonicalization', () => {
    it('canonicalizes relative and unnormalized paths at persistence boundary', async () => {
      const movie = await repo.createMovie({
        title: `Path Test (${Date.now()})`,
      });
      const edition = await repo.createEdition({ movieId: movie.id });
      const version = await repo.createMediaVersion({ editionId: edition.id });

      const rawPathWithDots = `/media/movies//folder/../test-${Date.now()}.mkv`;
      const expectedCanonical = normalize(resolve(rawPathWithDots));

      const asset = await repo.createAsset({
        mediaVersionId: version.id,
        path: rawPathWithDots,
        sizeBytes: 1024,
        mtime: new Date(),
      });

      expect(asset.path).toBe(expectedCanonical);
      expect(asset.path).not.toContain('//');
      expect(asset.path).not.toContain('/../');

      // Query by non-canonical path still finds it because getAssetByPath canonicalizes
      const found = await repo.getAssetByPath(rawPathWithDots);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(asset.id);
      expect(found?.path).toBe(expectedCanonical);
    });

    it('does not invoke realpath() by default so symlinks are not resolved', () => {
      const symlinkLikePath = '/var/media/symlink/movie.mp4';
      const canonical = canonicalizeAssetPath(symlinkLikePath);
      // canonical is an absolute normalized path without resolving the symlink target
      expect(canonical).toBe(normalize(resolve(symlinkLikePath)));
    });
  });

  describe('MediaTechnicalMetadata (1:1 with Asset)', () => {
    it('attaches and retrieves technical metadata for an Asset', async () => {
      const movie = await repo.createMovie({
        title: `Tech Metadata Test (${Date.now()})`,
      });
      const edition = await repo.createEdition({ movieId: movie.id });
      const version = await repo.createMediaVersion({ editionId: edition.id });
      const asset = await repo.createAsset({
        mediaVersionId: version.id,
        path: `/media/tech-test-${Date.now()}.mkv`,
        sizeBytes: 5_000_000_000,
        mtime: new Date(),
      });

      const tech = await repo.setTechnicalMetadata({
        assetId: asset.id,
        container: 'matroska',
        formatName: 'matroska,webm',
        durationSeconds: 7200.45,
        bitRate: 15_000_000,
        width: 1920,
        height: 1080,
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioChannels: 6,
      });

      expect(tech.assetId).toBe(asset.id);
      expect(tech.videoCodec).toBe('h264');
      expect(tech.audioChannels).toBe(6);
      expect(tech.durationSeconds).toBe(7200.45);

      // Verify retrieval through Asset
      const assetWithTech = await repo.getAsset(asset.id);
      expect(assetWithTech?.technicalMetadata).not.toBeNull();
      expect(assetWithTech?.technicalMetadata?.videoCodec).toBe('h264');

      // Verify direct lookup
      const direct = await repo.getTechnicalMetadataByAssetId(asset.id);
      expect(direct?.container).toBe('matroska');
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
    it('enforces uniqueness on canonical Asset path', async () => {
      const movie = await repo.createMovie({ title: 'Unique Test' });
      const edition = await repo.createEdition({ movieId: movie.id });
      const version = await repo.createMediaVersion({ editionId: edition.id });
      const uniquePath = `/unique/path/test-${Date.now()}.mp4`;

      await repo.createAsset({
        mediaVersionId: version.id,
        path: uniquePath,
        sizeBytes: 1024,
        mtime: new Date(),
      });

      // Second asset with equivalent path must fail
      await expect(
        repo.createAsset({
          mediaVersionId: version.id,
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

  describe('Fresh migration into an empty database', () => {
    it('deploys migrations onto an empty SQLite file and performs repository operations', async () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'medialoom-db-test-'));
      const tempDbPath = join(tempDir, 'test.db');

      try {
        execSync('bunx prisma migrate deploy --schema packages/db/prisma/schema.prisma', {
          env: {
            ...process.env,
            DATABASE_URL: `file:${tempDbPath}`,
          },
          stdio: 'pipe',
        });

        const freshPrisma = new PrismaClient({
          datasources: {
            db: {
              url: `file:${tempDbPath}`,
            },
          },
        });

        const freshRepo = new InventoryRepository(freshPrisma);

        const scan = await freshRepo.createScan({ rootPath: '/fresh' });
        expect(scan.status).toBe('RUNNING');

        const movie = await freshRepo.createMovie({
          title: 'Fresh Movie',
          status: 'UNMATCHED',
        });
        expect(movie.id).toBeDefined();

        const edition = await freshRepo.createEdition({ movieId: movie.id });
        const version = await freshRepo.createMediaVersion({
          editionId: edition.id,
        });

        const asset = await freshRepo.createAsset({
          mediaVersionId: version.id,
          path: '/fresh/file.mp4',
          sizeBytes: 12345,
          mtime: new Date(),
        });
        expect(asset.mediaVersionId).toBe(version.id);

        await freshRepo.setTechnicalMetadata({
          assetId: asset.id,
          container: 'mp4',
          videoCodec: 'h264',
        });

        const retrieved = await freshRepo.getMovie(movie.id);
        expect(retrieved?.editions).toHaveLength(1);
        expect(retrieved?.editions[0]?.mediaVersions[0]?.assets).toHaveLength(1);
        expect(
          retrieved?.editions[0]?.mediaVersions[0]?.assets[0]?.technicalMetadata?.videoCodec,
        ).toBe('h264');

        await freshPrisma.$disconnect();
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
