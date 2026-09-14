import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { movieLayoutPlanSchema } from '@medialoom/contracts';
import type { MovieWithHierarchy } from '@medialoom/db';
import { defaultJellyfinMovieProfile } from '../src/jellyfin/jellyfin-profile';

describe('Stage 9: Jellyfin Multi-Version Output Layout', () => {
  it('generates multi-version Jellyfin layout with exact folder name prefix and single movie.nfo', () => {
    const destinationRoot = '/media/jellyfin/movies';

    const matrixMultiVersionMovie: MovieWithHierarchy = {
      id: 'movie-matrix-603',
      title: 'The Matrix',
      originalTitle: 'The Matrix',
      year: 1999,
      runtimeMinutes: 136,
      overview: 'A computer hacker learns the truth about reality.',
      status: 'MATCHED',
      matchConfidence: 0.99,
      matchDetails: JSON.stringify({ score: 0.99, provider: 'tmdb', providerId: '603' }),
      tmdbId: 603,
      imdbId: 'tt0133093',
      createdAt: new Date(),
      updatedAt: new Date(),
      editions: [
        {
          id: 'edition-theatrical',
          movieId: 'movie-matrix-603',
          name: null,
          normalizedName: null,
          type: 'DEFAULT',
          source: 'DEFAULT',
          runtimeMinutes: 136,
          needsReview: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          mediaVersions: [
            {
              id: 'version-bluray-1080p',
              editionId: 'edition-theatrical',
              name: '1080p BluRay',
              createdAt: new Date(),
              updatedAt: new Date(),
              assets: [
                {
                  id: 'asset-bluray',
                  mediaVersionId: 'version-bluray-1080p',
                  type: 'VIDEO',
                  path: '/incoming/The.Matrix.1999.1080p.BluRay.x264.mkv',
                  sizeBytes: 8500000000n,
                  mtime: new Date(),
                  present: true,
                  filenameMetadata: {
                    id: 'fn-bluray',
                    assetId: 'asset-bluray',
                    title: 'The Matrix',
                    year: 1999,
                    type: 'movie',
                    edition: null,
                    screenSize: '1080p',
                    source: 'Blu-ray',
                    videoCodec: 'x264',
                    audioCodec: 'DTS',
                    audioChannels: '5.1',
                    releaseGroup: null,
                    streamingService: null,
                    container: 'mkv',
                    language: 'en',
                    rawJson: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                  technicalMetadata: {
                    id: 'tech-bluray',
                    assetId: 'asset-bluray',
                    container: 'matroska',
                    formatName: 'matroska',
                    durationSeconds: 8160,
                    bitRate: 8500000n,
                    width: 1920,
                    height: 1080,
                    videoCodec: 'h264',
                    frameRate: 23.976,
                    bitDepth: 8,
                    hdrFormat: null,
                    audioCodec: 'dts',
                    audioChannels: 6,
                    audioLanguage: 'eng',
                    audioLayout: '5.1',
                    rawJson: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    streams: [],
                  },
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ],
            },
            {
              id: 'version-dvd-576p',
              editionId: 'edition-theatrical',
              name: '576p DVD',
              createdAt: new Date(),
              updatedAt: new Date(),
              assets: [
                {
                  id: 'asset-dvd',
                  mediaVersionId: 'version-dvd-576p',
                  type: 'VIDEO',
                  path: '/incoming/The.Matrix.1999.DVD.x264.mkv',
                  sizeBytes: 2100000000n,
                  mtime: new Date(),
                  present: true,
                  filenameMetadata: {
                    id: 'fn-dvd',
                    assetId: 'asset-dvd',
                    title: 'The Matrix',
                    year: 1999,
                    type: 'movie',
                    edition: null,
                    screenSize: null,
                    source: 'DVD',
                    videoCodec: 'x264',
                    audioCodec: 'AC3',
                    audioChannels: '5.1',
                    releaseGroup: null,
                    streamingService: null,
                    container: 'mkv',
                    language: 'en',
                    rawJson: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                  technicalMetadata: {
                    id: 'tech-dvd',
                    assetId: 'asset-dvd',
                    container: 'matroska',
                    formatName: 'matroska',
                    durationSeconds: 8160,
                    bitRate: 2100000n,
                    width: 720,
                    height: 576,
                    videoCodec: 'h264',
                    frameRate: 25.0,
                    bitDepth: 8,
                    hdrFormat: null,
                    audioCodec: 'ac3',
                    audioChannels: 6,
                    audioLanguage: 'eng',
                    audioLayout: '5.1',
                    rawJson: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    streams: [],
                  },
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ],
            },
          ],
        },
      ],
    };

    const plan = defaultJellyfinMovieProfile.generateMovieLayout({
      movie: matrixMultiVersionMovie,
      destinationRoot,
    });

    const validated = movieLayoutPlanSchema.parse(plan);

    // 1. Directory is singular and canonical
    expect(validated.directory).toBe('The Matrix (1999) [tmdbid-603]');
    expect(validated.destinationDirectory).toBe(
      path.resolve(destinationRoot, 'The Matrix (1999) [tmdbid-603]'),
    );

    // 2. Both media versions are present in mediaFiles
    expect(validated.mediaFiles).toHaveLength(2);

    const blurayPlan = validated.mediaFiles[0];
    if (!blurayPlan) throw new Error('Expected blurayPlan');
    expect(blurayPlan.mediaFilename).toBe('The Matrix (1999) [tmdbid-603] - 1080p BluRay.mkv');
    expect(blurayPlan.versionLabel).toBe('1080p BluRay');
    expect(blurayPlan.relativeMediaPath).toBe(
      'The Matrix (1999) [tmdbid-603]/The Matrix (1999) [tmdbid-603] - 1080p BluRay.mkv',
    );
    expect(blurayPlan.sourceMediaPath).toBe('/incoming/The.Matrix.1999.1080p.BluRay.x264.mkv');

    const dvdPlan = validated.mediaFiles[1];
    if (!dvdPlan) throw new Error('Expected dvdPlan');
    expect(dvdPlan.mediaFilename).toBe('The Matrix (1999) [tmdbid-603] - 576p DVD.mkv');
    expect(dvdPlan.versionLabel).toBe('576p DVD');
    expect(dvdPlan.relativeMediaPath).toBe(
      'The Matrix (1999) [tmdbid-603]/The Matrix (1999) [tmdbid-603] - 576p DVD.mkv',
    );
    expect(dvdPlan.sourceMediaPath).toBe('/incoming/The.Matrix.1999.DVD.x264.mkv');

    // 3. Exact Jellyfin common filename prefix: before " - ", filename must match folder name exactly
    const folderPrefix = validated.directory;
    expect(blurayPlan.mediaFilename.startsWith(`${folderPrefix} - `)).toBe(true);
    expect(dvdPlan.mediaFilename.startsWith(`${folderPrefix} - `)).toBe(true);

    // 4. Exactly one movie.nfo shared sidecar
    expect(validated.sidecars).toHaveLength(1);
    const nfo = validated.sidecars[0];
    if (!nfo) throw new Error('Expected nfo');
    expect(nfo.filename).toBe('movie.nfo');
    expect(nfo.relativePath).toBe('The Matrix (1999) [tmdbid-603]/movie.nfo');
    expect(nfo.destinationPath).toBe(
      path.resolve(destinationRoot, 'The Matrix (1999) [tmdbid-603]', 'movie.nfo'),
    );
  });
});
