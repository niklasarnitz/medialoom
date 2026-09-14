import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import type { MovieWithHierarchy } from '@medialoom/db';
import { defaultJellyfinMovieProfile } from '../src/jellyfin/jellyfin-profile';

describe('JellyfinMovieProfile', () => {
  const profile = defaultJellyfinMovieProfile;
  const destinationRoot = '/media/dest/movies';

  it('generates target Jellyfin layout for The Matrix (1999) TMDb 603', () => {
    const mockMovie: MovieWithHierarchy = {
      id: 'movie-123',
      title: 'The Matrix',
      originalTitle: 'The Matrix',
      year: 1999,
      runtimeMinutes: 136,
      overview: 'A hacker learns the truth.',
      status: 'MATCHED',
      matchConfidence: 0.98,
      matchDetails: null,
      tmdbId: 603,
      imdbId: 'tt0133093',
      createdAt: new Date(),
      updatedAt: new Date(),
      editions: [
        {
          id: 'edition-1',
          movieId: 'movie-123',
          name: 'Standard',
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
                  path: '/incoming/The.Matrix.1999.mkv',
                  sizeBytes: 1500000000n,
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

    const plan = profile.generateMovieLayout({
      movie: mockMovie,
      destinationRoot,
    });

    expect(plan.profile).toBe('jellyfin');
    expect(plan.destinationRoot).toBe(path.resolve(destinationRoot));
    expect(plan.directory).toBe('The Matrix (1999) [tmdbid-603]');
    expect(plan.destinationDirectory).toBe(
      path.resolve(destinationRoot, 'The Matrix (1999) [tmdbid-603]'),
    );
    expect(plan.mediaFilename).toBe('The Matrix (1999) [tmdbid-603].mkv');
    expect(plan.relativeMediaPath).toBe(
      'The Matrix (1999) [tmdbid-603]/The Matrix (1999) [tmdbid-603].mkv',
    );
    expect(plan.destinationMediaPath).toBe(
      path.resolve(
        destinationRoot,
        'The Matrix (1999) [tmdbid-603]',
        'The Matrix (1999) [tmdbid-603].mkv',
      ),
    );
    expect(plan.sourceMediaPath).toBe('/incoming/The.Matrix.1999.mkv');

    expect(plan.sidecars).toHaveLength(1);
    const nfoSidecar = plan.sidecars[0];
    if (!nfoSidecar) throw new Error('Expected sidecar');
    expect(nfoSidecar.filename).toBe('movie.nfo');
    expect(nfoSidecar.type).toBe('nfo');
    expect(nfoSidecar.relativePath).toBe('The Matrix (1999) [tmdbid-603]/movie.nfo');
    expect(nfoSidecar.destinationPath).toBe(
      path.resolve(destinationRoot, 'The Matrix (1999) [tmdbid-603]', 'movie.nfo'),
    );
    expect(nfoSidecar.content).toContain('<title>The Matrix</title>');
    expect(nfoSidecar.content).toContain('<tmdbid>603</tmdbid>');
    expect(nfoSidecar.content).toContain('<imdbid>tt0133093</imdbid>');
  });

  it('preserves source media extension (.mp4, .avi, etc.)', () => {
    const mockMovie: MovieWithHierarchy = {
      id: 'movie-456',
      title: 'Blade Runner 2049',
      originalTitle: 'Blade Runner 2049',
      year: 2017,
      runtimeMinutes: 164,
      overview: 'A blade runner unearths a secret.',
      status: 'MATCHED',
      matchConfidence: 0.95,
      matchDetails: null,
      tmdbId: 335984,
      imdbId: 'tt1856101',
      createdAt: new Date(),
      updatedAt: new Date(),
      editions: [
        {
          id: 'edition-1',
          movieId: 'movie-456',
          name: 'Standard',
          createdAt: new Date(),
          updatedAt: new Date(),
          mediaVersions: [
            {
              id: 'version-1',
              editionId: 'edition-1',
              name: '2160p',
              createdAt: new Date(),
              updatedAt: new Date(),
              assets: [
                {
                  id: 'asset-1',
                  mediaVersionId: 'version-1',
                  type: 'VIDEO',
                  path: '/incoming/Blade.Runner.2049.2017.mp4',
                  sizeBytes: 2500000000n,
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

    const plan = profile.generateMovieLayout({
      movie: mockMovie,
      destinationRoot,
    });

    expect(plan.mediaFilename).toBe('Blade Runner 2049 (2017) [tmdbid-335984].mp4');
    expect(plan.relativeMediaPath).toBe(
      'Blade Runner 2049 (2017) [tmdbid-335984]/Blade Runner 2049 (2017) [tmdbid-335984].mp4',
    );
  });

  it('sanitizes malicious title and stays strictly contained in destination root', () => {
    const mockMovie: MovieWithHierarchy = {
      id: 'movie-malicious',
      title: '../../../../etc/passwd',
      originalTitle: null,
      year: 2020,
      runtimeMinutes: 90,
      overview: 'Evil plot.',
      status: 'MATCHED',
      matchConfidence: 0.9,
      matchDetails: null,
      tmdbId: 101,
      imdbId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      editions: [],
    };

    const plan = profile.generateMovieLayout({
      movie: mockMovie,
      destinationRoot,
      sourcePathOverride: '/path/to/movie.mkv',
    });

    expect(plan.directory).toBe('etc - passwd (2020) [tmdbid-101]');
    expect(plan.destinationDirectory.startsWith(path.resolve(destinationRoot))).toBe(true);
    expect(plan.destinationMediaPath.startsWith(path.resolve(destinationRoot))).toBe(true);
    expect(plan.sidecars[0]?.destinationPath.startsWith(path.resolve(destinationRoot))).toBe(true);
  });
});
