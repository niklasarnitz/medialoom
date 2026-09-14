import { describe, expect, it } from 'bun:test';
import {
  AssetType,
  assetSchema,
  createAssetInputSchema,
  createMediaItemInputSchema,
  createMovieInputSchema,
  createScanInputSchema,
  mediaItemSchema,
  mediaItemWithAssetsSchema,
  movieSchema,
  scanSchema,
} from '../src';

describe('Inventory Domain Contracts', () => {
  describe('Asset', () => {
    it('validates a correct Asset object', () => {
      const now = new Date();
      const raw = {
        id: 'asset_1',
        mediaItemId: 'item_1',
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
      expect(parsed.sizeBytes).toBe(15_000_000_000);
      expect(parsed.mtime).toEqual(now);
      expect(parsed.type).toBe('VIDEO');
    });

    it('allows extensible custom asset types', () => {
      const raw = {
        id: 'asset_sub',
        mediaItemId: 'item_1',
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

    it('rejects invalid sizeBytes (negative or non-integer)', () => {
      expect(() =>
        createAssetInputSchema.parse({
          mediaItemId: 'item_1',
          path: '/path/to/file.mp4',
          sizeBytes: -10,
          mtime: new Date(),
        }),
      ).toThrow();
    });
  });

  describe('Movie', () => {
    it('validates a full canonical Movie object', () => {
      const movie = {
        id: 'movie_1',
        title: 'Inception',
        originalTitle: 'Inception',
        year: 2010,
        runtimeMinutes: 148,
        overview: 'A thief who steals corporate secrets through dream-sharing...',
        tmdbId: 27205,
        imdbId: 'tt1375666',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const parsed = movieSchema.parse(movie);
      expect(parsed.title).toBe('Inception');
      expect(parsed.tmdbId).toBe(27205);
    });

    it('validates Movie with nullable optional metadata', () => {
      const input = {
        title: 'Unknown Movie',
      };
      const parsed = createMovieInputSchema.parse(input);
      expect(parsed.title).toBe('Unknown Movie');
      expect(parsed.year).toBeUndefined();
    });
  });

  describe('MediaItem', () => {
    it('validates an unmatched MediaItem without movieId', () => {
      const parsed = createMediaItemInputSchema.parse({});
      expect(parsed.status).toBe('UNMATCHED');
      expect(parsed.movieId).toBeUndefined();
    });

    it('validates MediaItem with attached assets and movie', () => {
      const now = new Date();
      const complexItem = {
        id: 'item_1',
        movieId: 'movie_1',
        status: 'MATCHED' as const,
        matchConfidence: 0.98,
        createdAt: now,
        updatedAt: now,
        assets: [
          {
            id: 'asset_1',
            mediaItemId: 'item_1',
            type: AssetType.VIDEO,
            path: '/path/video.mkv',
            sizeBytes: 1000,
            mtime: now,
            present: true,
            createdAt: now,
            updatedAt: now,
          },
        ],
        movie: {
          id: 'movie_1',
          title: 'The Matrix',
          createdAt: now,
          updatedAt: now,
        },
      };

      const parsed = mediaItemWithAssetsSchema.parse(complexItem);
      expect(parsed.assets).toHaveLength(1);
      expect(parsed.movie?.title).toBe('The Matrix');
      expect(parsed.status).toBe('MATCHED');
    });

    it('rejects invalid status', () => {
      expect(() =>
        mediaItemSchema.parse({
          id: 'item_1',
          status: 'INVALID_STATUS',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ).toThrow();
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
