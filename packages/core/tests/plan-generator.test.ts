import { describe, expect, it } from 'bun:test';
import type { MovieWithHierarchy } from '@medialoom/db';
import { defaultPlanGenerator } from '../src';

describe('PlanGenerator', () => {
  const mockMatrixMovie: MovieWithHierarchy = {
    id: 'movie_matrix_1999',
    title: 'The Matrix',
    originalTitle: 'The Matrix',
    year: 1999,
    runtimeMinutes: 136,
    overview: 'A computer hacker learns about the true nature of reality.',
    status: 'MATCHED',
    matchConfidence: 0.99,
    matchDetails: null,
    tmdbId: 603,
    imdbId: 'tt0133093',
    createdAt: new Date(),
    updatedAt: new Date(),
    editions: [
      {
        id: 'edition_1',
        movieId: 'movie_matrix_1999',
        name: null,
        normalizedName: null,
        type: 'DEFAULT',
        source: 'DEFAULT',
        runtimeMinutes: null,
        needsReview: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        mediaVersions: [
          {
            id: 'version_1',
            editionId: 'edition_1',
            name: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            assets: [
              {
                id: 'asset_1',
                mediaVersionId: 'version_1',
                type: 'VIDEO',
                path: '/incoming/The.Matrix.1999.mkv',
                sizeBytes: 8500000000n,
                mtime: new Date(),
                present: true,
                createdAt: new Date(),
                updatedAt: new Date(),
                technicalMetadata: null,
                filenameMetadata: null,
              },
            ],
          },
        ],
      },
    ],
  };

  it('generates exact operation output for a known movie (The Matrix 1999)', () => {
    const { operations, layout } = defaultPlanGenerator.generateOperations({
      movie: mockMatrixMovie,
      destinationRoot: '/movies',
      profile: 'jellyfin',
    });

    expect(layout.directory).toBe('The Matrix (1999) [tmdbid-603]');
    expect(layout.destinationDirectory).toBe('/movies/The Matrix (1999) [tmdbid-603]');

    expect(operations).toHaveLength(3);

    // 1. mkdir
    expect(operations[0]).toEqual({
      type: 'mkdir',
      path: '/movies/The Matrix (1999) [tmdbid-603]',
      metadata: {
        directory: 'The Matrix (1999) [tmdbid-603]',
      },
    });

    // 2. move
    expect(operations[1]).toEqual({
      type: 'move',
      source: '/incoming/The.Matrix.1999.mkv',
      destination: '/movies/The Matrix (1999) [tmdbid-603]/The Matrix (1999) [tmdbid-603].mkv',
      metadata: {
        filename: 'The Matrix (1999) [tmdbid-603].mkv',
        relativeMediaPath: 'The Matrix (1999) [tmdbid-603]/The Matrix (1999) [tmdbid-603].mkv',
      },
    });

    // 3. writeText (movie.nfo)
    expect(operations[2]?.type).toBe('writeText');
    if (operations[2]?.type === 'writeText') {
      expect(operations[2].path).toBe('/movies/The Matrix (1999) [tmdbid-603]/movie.nfo');
      expect(operations[2].content).toContain('<title>The Matrix</title>');
      expect(operations[2].content).toContain(
        '<uniqueid type="tmdb" default="true">603</uniqueid>',
      );
      expect(operations[2].content).toContain('<uniqueid type="imdb">tt0133093</uniqueid>');
    }
  });
});
