import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { movieLayoutPlanSchema } from '@medialoom/contracts';
import type { MovieWithHierarchy } from '@medialoom/db';
import { defaultJellyfinMovieProfile } from '../src/jellyfin/jellyfin-profile';
import { getMovieProfile } from '../src/registry';

describe('Stage 8 Acceptance: Jellyfin Movie Output Profile & NFO Generation', () => {
  it('for a matched movie (The Matrix 1999, TMDb 603), calculates Jellyfin filesystem layout and deterministic NFO', () => {
    const destinationRoot = '/media/jellyfin/movies';

    const matrixMovie: MovieWithHierarchy = {
      id: 'movie-matrix-603',
      title: 'The Matrix',
      originalTitle: 'The Matrix',
      year: 1999,
      runtimeMinutes: 136,
      overview:
        'A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.',
      status: 'MATCHED',
      matchConfidence: 0.99,
      matchDetails: JSON.stringify({ score: 0.99, provider: 'tmdb', providerId: '603' }),
      tmdbId: 603,
      imdbId: 'tt0133093',
      createdAt: new Date(),
      updatedAt: new Date(),
      editions: [
        {
          id: 'edition-1',
          movieId: 'movie-matrix-603',
          name: 'Theatrical',
          createdAt: new Date(),
          updatedAt: new Date(),
          mediaVersions: [
            {
              id: 'version-1',
              editionId: 'edition-1',
              name: '1080p',
              createdAt: new Date(),
              updatedAt: new Date(),
              assets: [
                {
                  id: 'asset-1',
                  mediaVersionId: 'version-1',
                  type: 'VIDEO',
                  path: '/Volumes/Movies/The.Matrix.1999.1080p.BluRay.x264.mkv',
                  sizeBytes: 8500000000n,
                  mtime: new Date(),
                  present: true,
                  technicalMetadata: null,
                  filenameMetadata: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ],
            },
          ],
        },
      ],
    };

    const profile = getMovieProfile('jellyfin');
    expect(profile).toBeDefined();
    expect(profile).toBe(defaultJellyfinMovieProfile);
    if (!profile) throw new Error('Profile not found');

    // Generate layout plan (pure calculation, read-only)
    const plan = profile.generateMovieLayout({
      movie: matrixMovie,
      destinationRoot,
    });

    // 1. Validate contract schema
    const validatedPlan = movieLayoutPlanSchema.parse(plan);
    expect(validatedPlan.profile).toBe('jellyfin');
    expect(validatedPlan.destinationRoot).toBe(path.resolve(destinationRoot));

    // 2. Validate Target Layout
    // Target directory: The Matrix (1999) [tmdbid-603]
    expect(validatedPlan.directory).toBe('The Matrix (1999) [tmdbid-603]');
    expect(validatedPlan.destinationDirectory).toBe(
      path.resolve(destinationRoot, 'The Matrix (1999) [tmdbid-603]'),
    );

    // Target media filename: The Matrix (1999) [tmdbid-603].mkv
    expect(validatedPlan.mediaFilename).toBe('The Matrix (1999) [tmdbid-603].mkv');
    expect(validatedPlan.relativeMediaPath).toBe(
      'The Matrix (1999) [tmdbid-603]/The Matrix (1999) [tmdbid-603].mkv',
    );
    expect(validatedPlan.destinationMediaPath).toBe(
      path.resolve(
        destinationRoot,
        'The Matrix (1999) [tmdbid-603]',
        'The Matrix (1999) [tmdbid-603].mkv',
      ),
    );
    expect(validatedPlan.sourceMediaPath).toBe(
      '/Volumes/Movies/The.Matrix.1999.1080p.BluRay.x264.mkv',
    );

    // 3. Validate Sidecars (movie.nfo)
    expect(validatedPlan.sidecars).toHaveLength(1);
    const nfo = validatedPlan.sidecars[0];
    if (!nfo) throw new Error('Expected sidecar');
    expect(nfo.filename).toBe('movie.nfo');
    expect(nfo.type).toBe('nfo');
    expect(nfo.relativePath).toBe('The Matrix (1999) [tmdbid-603]/movie.nfo');
    expect(nfo.destinationPath).toBe(
      path.resolve(destinationRoot, 'The Matrix (1999) [tmdbid-603]', 'movie.nfo'),
    );

    // 4. Validate Deterministic XML Contents
    const expectedNfo = [
      '<?xml version="1.0" encoding="utf-8" standalone="yes"?>',
      '<movie>',
      '  <title>The Matrix</title>',
      '  <originaltitle>The Matrix</originaltitle>',
      '  <year>1999</year>',
      '  <plot>A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.</plot>',
      '  <runtime>136</runtime>',
      '  <tmdbid>603</tmdbid>',
      '  <imdbid>tt0133093</imdbid>',
      '  <uniqueid type="tmdb" default="true">603</uniqueid>',
      '  <uniqueid type="imdb">tt0133093</uniqueid>',
      '</movie>',
      '',
    ].join('\n');

    expect(nfo.content).toBe(expectedNfo);

    // 5. Destination Containment
    expect(validatedPlan.destinationDirectory.startsWith(path.resolve(destinationRoot))).toBe(true);
    expect(validatedPlan.destinationMediaPath.startsWith(path.resolve(destinationRoot))).toBe(true);
    expect(nfo.destinationPath.startsWith(path.resolve(destinationRoot))).toBe(true);
  });
});
