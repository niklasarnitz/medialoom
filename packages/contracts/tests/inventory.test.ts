import { describe, expect, it } from 'bun:test';
import {
  AssetType,
  assetSchema,
  createAssetInputSchema,
  createEditionInputSchema,
  createMediaVersionInputSchema,
  createMovieInputSchema,
  createScanInputSchema,
  editionSchema,
  mediaTechnicalMetadataSchema,
  mediaVersionSchema,
  movieWithEditionsSchema,
  scanSchema,
} from '../src';

describe('Inventory Domain Contracts', () => {
  describe('Asset & Technical Metadata', () => {
    it('validates a correct Asset object', () => {
      const now = new Date();
      const raw = {
        id: 'asset_1',
        mediaVersionId: 'version_1',
        type: AssetType.VIDEO,
        path: '/media/movies/Inception (2010)/Inception.mkv',
        sizeBytes: 15_000_000_000,
        mtime: now.toISOString(),
        present: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      const parsed = assetSchema.parse(raw);
      expect(parsed.id).toBe('asset_1');
      expect(parsed.mediaVersionId).toBe('version_1');
      expect(parsed.sizeBytes).toBe(15_000_000_000);
      expect(parsed.mtime).toEqual(now);
      expect(parsed.type).toBe('VIDEO');
    });

    it('validates 1:1 MediaTechnicalMetadata', () => {
      const raw = {
        id: 'tech_1',
        assetId: 'asset_1',
        container: 'matroska',
        formatName: 'matroska,webm',
        durationSeconds: 8880.5,
        bitRate: 25_000_000,
        width: 3840,
        height: 2160,
        videoCodec: 'hevc',
        audioCodec: 'truehd',
        audioChannels: 8,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const parsed = mediaTechnicalMetadataSchema.parse(raw);
      expect(parsed.assetId).toBe('asset_1');
      expect(parsed.videoCodec).toBe('hevc');
      expect(parsed.audioChannels).toBe(8);
    });

    it('allows extensible custom asset types', () => {
      const raw = {
        id: 'asset_sub',
        mediaVersionId: 'version_1',
        type: 'SUBTITLE',
        path: '/media/movies/Inception (2010)/Inception.en.srt',
        sizeBytes: 45_000,
        mtime: new Date(),
        present: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const parsed = assetSchema.parse(raw);
      expect(parsed.type).toBe('SUBTITLE');
    });

    it('rejects invalid sizeBytes', () => {
      expect(() =>
        createAssetInputSchema.parse({
          mediaVersionId: 'version_1',
          path: '/path/to/file.mp4',
          sizeBytes: -10,
          mtime: new Date(),
        }),
      ).toThrow();
    });
  });

  describe('Edition & MediaVersion', () => {
    it('validates Edition with optional name', () => {
      const edition = editionSchema.parse({
        id: 'ed_1',
        movieId: 'movie_1',
        name: 'Director’s Cut',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(edition.name).toBe('Director’s Cut');

      const defaultEdition = createEditionInputSchema.parse({
        movieId: 'movie_1',
      });
      expect(defaultEdition.name).toBeUndefined();
    });

    it('validates MediaVersion with optional quality name', () => {
      const version = mediaVersionSchema.parse({
        id: 'mv_1',
        editionId: 'ed_1',
        name: '2160p UHD BluRay',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      expect(version.name).toBe('2160p UHD BluRay');

      const defaultVersion = createMediaVersionInputSchema.parse({
        editionId: 'ed_1',
      });
      expect(defaultVersion.name).toBeUndefined();
    });
  });

  describe('Movie with Hierarchy', () => {
    it('validates an unmatched Movie with default status and no TMDb ID', () => {
      const input = {
        title: 'Unmatched Movie',
      };
      const parsed = createMovieInputSchema.parse(input);
      expect(parsed.title).toBe('Unmatched Movie');
      expect(parsed.status).toBe('UNMATCHED');
      expect(parsed.tmdbId).toBeUndefined();
    });

    it('validates a full Movie hierarchy (Movie -> Edition -> MediaVersion -> Asset)', () => {
      const now = new Date();
      const hierarchy = {
        id: 'movie_1',
        title: 'Blade Runner',
        status: 'MATCHED' as const,
        tmdbId: 78,
        createdAt: now,
        updatedAt: now,
        editions: [
          {
            id: 'ed_1',
            movieId: 'movie_1',
            name: 'The Final Cut',
            createdAt: now,
            updatedAt: now,
            mediaVersions: [
              {
                id: 'ver_1',
                editionId: 'ed_1',
                name: '2160p Remux',
                createdAt: now,
                updatedAt: now,
                assets: [
                  {
                    id: 'asset_1',
                    mediaVersionId: 'ver_1',
                    type: AssetType.VIDEO,
                    path: '/media/Blade Runner/Final Cut.mkv',
                    sizeBytes: 50_000_000_000,
                    mtime: now,
                    present: true,
                    createdAt: now,
                    updatedAt: now,
                    technicalMetadata: {
                      id: 'tech_1',
                      assetId: 'asset_1',
                      container: 'matroska',
                      videoCodec: 'hevc',
                      width: 3840,
                      height: 2160,
                      createdAt: now,
                      updatedAt: now,
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const parsed = movieWithEditionsSchema.parse(hierarchy);
      expect(parsed.editions).toHaveLength(1);
      expect(parsed.editions[0]?.mediaVersions).toHaveLength(1);
      expect(parsed.editions[0]?.mediaVersions[0]?.assets).toHaveLength(1);
      expect(parsed.editions[0]?.mediaVersions[0]?.assets[0]?.technicalMetadata?.videoCodec).toBe(
        'hevc',
      );
    });
  });

  describe('Scan', () => {
    it('validates a new Scan with defaults', () => {
      const parsed = createScanInputSchema.parse({
        rootPath: '/media/movies',
      });
      expect(parsed.rootPath).toBe('/media/movies');
      expect(parsed.status).toBe('RUNNING');
    });

    it('validates a completed Scan object', () => {
      const now = new Date();
      const scan = {
        id: 'scan_1',
        rootPath: '/media/movies',
        status: 'COMPLETED' as const,
        startedAt: now,
        completedAt: now,
        discoveredCount: 15,
        createdCount: 10,
        updatedCount: 5,
        failedCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      const parsed = scanSchema.parse(scan);
      expect(parsed.status).toBe('COMPLETED');
      expect(parsed.discoveredCount).toBe(15);
    });
  });
});
