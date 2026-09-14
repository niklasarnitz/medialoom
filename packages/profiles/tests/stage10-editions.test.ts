import { describe, expect, it } from 'bun:test';
import { InventoryService } from '@medialoom/core';
import { defaultInventoryRepository, type MovieWithHierarchy } from '@medialoom/db';
import { detectEdition, normalizeEditionLabel } from '@medialoom/media';
import { JellyfinMovieProfile } from '../src/jellyfin/jellyfin-profile';
import { generateBaseVersionLabel, resolveVersionLabels } from '../src/jellyfin/version-label';

describe('Stage 10 Acceptance: Multiple Movie Editions & Cuts Belonging to One Canonical Movie', () => {
  const profile = new JellyfinMovieProfile();

  it('Test 1: Theatrical Cut + Final Cut under one canonical Movie', () => {
    const movie: MovieWithHierarchy = {
      id: 'movie-blade-runner',
      title: 'Blade Runner',
      originalTitle: 'Blade Runner',
      year: 1982,
      runtimeMinutes: 117,
      overview: 'A blade runner must pursue and terminate four replicants.',
      status: 'MATCHED',
      matchConfidence: 0.98,
      matchDetails: null,
      tmdbId: 78,
      imdbId: 'tt0083658',
      createdAt: new Date(),
      updatedAt: new Date(),
      editions: [
        {
          id: 'ed-theatrical',
          movieId: 'movie-blade-runner',
          name: 'Theatrical Cut',
          normalizedName: 'Theatrical Cut',
          type: 'THEATRICAL',
          source: 'FILENAME',
          runtimeMinutes: 117,
          needsReview: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          mediaVersions: [
            {
              id: 'ver-theatrical',
              editionId: 'ed-theatrical',
              name: 'Theatrical Cut',
              createdAt: new Date(),
              updatedAt: new Date(),
              assets: [
                {
                  id: 'asset-theatrical',
                  mediaVersionId: 'ver-theatrical',
                  type: 'VIDEO',
                  path: '/library/Blade.Runner.1982.Theatrical.Cut.mkv',
                  sizeBytes: BigInt(8000000000),
                  mtime: new Date(),
                  present: true,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  technicalMetadata: null,
                  filenameMetadata: {
                    id: 'fn-1',
                    assetId: 'asset-theatrical',
                    title: 'Blade Runner',
                    year: 1982,
                    type: 'movie',
                    edition: 'Theatrical Cut',
                    screenSize: null,
                    source: null,
                    videoCodec: null,
                    audioCodec: null,
                    audioChannels: null,
                    releaseGroup: null,
                    streamingService: null,
                    container: 'mkv',
                    language: null,
                    rawJson: '{}',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                },
              ],
            },
          ],
        },
        {
          id: 'ed-final-cut',
          movieId: 'movie-blade-runner',
          name: 'Final Cut',
          normalizedName: 'Final Cut',
          type: 'FINAL_CUT',
          source: 'FILENAME',
          runtimeMinutes: 117,
          needsReview: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          mediaVersions: [
            {
              id: 'ver-final-cut',
              editionId: 'ed-final-cut',
              name: 'Final Cut',
              createdAt: new Date(),
              updatedAt: new Date(),
              assets: [
                {
                  id: 'asset-final-cut',
                  mediaVersionId: 'ver-final-cut',
                  type: 'VIDEO',
                  path: '/library/Blade.Runner.1982.Final.Cut.mkv',
                  sizeBytes: BigInt(12000000000),
                  mtime: new Date(),
                  present: true,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  technicalMetadata: null,
                  filenameMetadata: {
                    id: 'fn-2',
                    assetId: 'asset-final-cut',
                    title: 'Blade Runner',
                    year: 1982,
                    type: 'movie',
                    edition: 'Final Cut',
                    screenSize: null,
                    source: null,
                    videoCodec: null,
                    audioCodec: null,
                    audioChannels: null,
                    releaseGroup: null,
                    streamingService: null,
                    container: 'mkv',
                    language: null,
                    rawJson: '{}',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const layout = profile.generateMovieLayout({
      movie,
      destinationRoot: '/media/movies',
    });

    expect(layout.directory).toBe('Blade Runner (1982) [tmdbid-78]');
    expect(layout.mediaFiles).toHaveLength(2);

    const filenames = layout.mediaFiles.map((m) => m.mediaFilename);
    expect(filenames).toContain('Blade Runner (1982) [tmdbid-78] - Theatrical Cut.mkv');
    expect(filenames).toContain('Blade Runner (1982) [tmdbid-78] - Final Cut.mkv');

    // Single movie.nfo for the entire canonical movie
    expect(layout.sidecars).toHaveLength(1);
    expect(layout.sidecars[0]?.filename).toBe('movie.nfo');
  });

  it('Test 2: Theatrical + Extended Edition (e.g. Lord of the Rings)', () => {
    const descriptors = [
      {
        id: '1',
        edition: 'Theatrical Cut',
        resolution: '2160p',
        source: 'UHD BluRay',
      },
      {
        id: '2',
        edition: 'Extended Edition',
        resolution: '2160p',
        source: 'UHD BluRay',
      },
    ];

    const labels = resolveVersionLabels(descriptors);
    expect(labels.get('1')).toBe('Theatrical Cut - 2160p UHD BluRay');
    expect(labels.get('2')).toBe('Extended Edition - 2160p UHD BluRay');
  });

  it('Test 3 & Acceptance Example: Final Cut 2160p + Final Cut 1080p + Theatrical 1080p', () => {
    const movie: MovieWithHierarchy = {
      id: 'blade-runner-full',
      title: 'Blade Runner',
      originalTitle: 'Blade Runner',
      year: 1982,
      runtimeMinutes: 117,
      overview: 'Sci-fi classic',
      status: 'MATCHED',
      matchConfidence: 1.0,
      matchDetails: null,
      tmdbId: 78,
      imdbId: 'tt0083658',
      createdAt: new Date(),
      updatedAt: new Date(),
      editions: [
        {
          id: 'ed-theatrical',
          movieId: 'blade-runner-full',
          name: 'Theatrical Cut',
          normalizedName: 'Theatrical Cut',
          type: 'THEATRICAL',
          source: 'FILENAME',
          runtimeMinutes: 117,
          needsReview: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          mediaVersions: [
            {
              id: 'ver-theatrical-1080p',
              editionId: 'ed-theatrical',
              name: '1080p BluRay',
              createdAt: new Date(),
              updatedAt: new Date(),
              assets: [
                {
                  id: 'asset-th-1080',
                  mediaVersionId: 'ver-theatrical-1080p',
                  type: 'VIDEO',
                  path: '/library/Blade.Runner.1982.Theatrical.Cut.1080p.BluRay.mkv',
                  sizeBytes: BigInt(8000000000),
                  mtime: new Date(),
                  present: true,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  technicalMetadata: {
                    id: 'tech-1',
                    assetId: 'asset-th-1080',
                    container: 'matroska',
                    formatName: 'matroska',
                    durationSeconds: 7020,
                    bitRate: BigInt(8000000),
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
                  filenameMetadata: {
                    id: 'fn-th-1080',
                    assetId: 'asset-th-1080',
                    title: 'Blade Runner',
                    year: 1982,
                    type: 'movie',
                    edition: 'Theatrical Cut',
                    screenSize: '1080p',
                    source: 'BluRay',
                    videoCodec: 'x264',
                    audioCodec: 'DTS',
                    audioChannels: '5.1',
                    releaseGroup: null,
                    streamingService: null,
                    container: 'mkv',
                    language: null,
                    rawJson: '{}',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                },
              ],
            },
          ],
        },
        {
          id: 'ed-final-cut',
          movieId: 'blade-runner-full',
          name: 'Final Cut',
          normalizedName: 'Final Cut',
          type: 'FINAL_CUT',
          source: 'FILENAME',
          runtimeMinutes: 117,
          needsReview: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          mediaVersions: [
            {
              id: 'ver-final-2160p',
              editionId: 'ed-final-cut',
              name: '2160p UHD BluRay',
              createdAt: new Date(),
              updatedAt: new Date(),
              assets: [
                {
                  id: 'asset-fc-2160',
                  mediaVersionId: 'ver-final-2160p',
                  type: 'VIDEO',
                  path: '/library/Blade.Runner.1982.Final.Cut.2160p.UHD.BluRay.mkv',
                  sizeBytes: BigInt(40000000000),
                  mtime: new Date(),
                  present: true,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  technicalMetadata: {
                    id: 'tech-2',
                    assetId: 'asset-fc-2160',
                    container: 'matroska',
                    formatName: 'matroska',
                    durationSeconds: 7020,
                    bitRate: BigInt(40000000),
                    width: 3840,
                    height: 2160,
                    videoCodec: 'hevc',
                    frameRate: 23.976,
                    bitDepth: 10,
                    hdrFormat: 'HDR10',
                    audioCodec: 'truehd',
                    audioChannels: 8,
                    audioLanguage: 'eng',
                    audioLayout: '7.1',
                    rawJson: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    streams: [],
                  },
                  filenameMetadata: {
                    id: 'fn-fc-2160',
                    assetId: 'asset-fc-2160',
                    title: 'Blade Runner',
                    year: 1982,
                    type: 'movie',
                    edition: 'Final Cut',
                    screenSize: '2160p',
                    source: 'UHD BluRay',
                    videoCodec: 'HEVC',
                    audioCodec: 'TrueHD',
                    audioChannels: '7.1',
                    releaseGroup: null,
                    streamingService: null,
                    container: 'mkv',
                    language: null,
                    rawJson: '{}',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                },
              ],
            },
            {
              id: 'ver-final-1080p',
              editionId: 'ed-final-cut',
              name: '1080p BluRay',
              createdAt: new Date(),
              updatedAt: new Date(),
              assets: [
                {
                  id: 'asset-fc-1080',
                  mediaVersionId: 'ver-final-1080p',
                  type: 'VIDEO',
                  path: '/library/Blade.Runner.1982.Final.Cut.1080p.BluRay.mkv',
                  sizeBytes: BigInt(9000000000),
                  mtime: new Date(),
                  present: true,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  technicalMetadata: {
                    id: 'tech-3',
                    assetId: 'asset-fc-1080',
                    container: 'matroska',
                    formatName: 'matroska',
                    durationSeconds: 7020,
                    bitRate: BigInt(9000000),
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
                  filenameMetadata: {
                    id: 'fn-fc-1080',
                    assetId: 'asset-fc-1080',
                    title: 'Blade Runner',
                    year: 1982,
                    type: 'movie',
                    edition: 'Final Cut',
                    screenSize: '1080p',
                    source: 'BluRay',
                    videoCodec: 'x264',
                    audioCodec: 'DTS',
                    audioChannels: '5.1',
                    releaseGroup: null,
                    streamingService: null,
                    container: 'mkv',
                    language: null,
                    rawJson: '{}',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const layout = profile.generateMovieLayout({
      movie,
      destinationRoot: '/Volumes/Library',
    });

    expect(layout.directory).toBe('Blade Runner (1982) [tmdbid-78]');
    expect(layout.mediaFiles).toHaveLength(3);

    const filenames = layout.mediaFiles.map((m) => m.mediaFilename);
    expect(filenames).toContain(
      'Blade Runner (1982) [tmdbid-78] - Theatrical Cut - 1080p BluRay.mkv',
    );
    expect(filenames).toContain(
      'Blade Runner (1982) [tmdbid-78] - Final Cut - 2160p UHD BluRay.mkv',
    );
    expect(filenames).toContain('Blade Runner (1982) [tmdbid-78] - Final Cut - 1080p BluRay.mkv');
  });

  it('Test 4: Same movie and same edition but several physical versions', () => {
    const descriptors = [
      { id: '1', edition: 'Extended Edition', resolution: '2160p', source: 'UHD BluRay' },
      { id: '2', edition: 'Extended Edition', resolution: '1080p', source: 'BluRay' },
      { id: '3', edition: 'Extended Edition', resolution: '576p', source: 'DVD' },
    ];

    const labels = resolveVersionLabels(descriptors);
    expect(labels.get('1')).toBe('Extended Edition - 2160p UHD BluRay');
    expect(labels.get('2')).toBe('Extended Edition - 1080p BluRay');
    expect(labels.get('3')).toBe('Extended Edition - 576p DVD');
  });

  it('Test 5: Edition normalization variants map to canonical display labels', () => {
    expect(normalizeEditionLabel('Extended Cut').normalizedName).toBe('Extended Edition');
    expect(normalizeEditionLabel('Extended').normalizedName).toBe('Extended Edition');
    expect(normalizeEditionLabel('Extended Edition').normalizedName).toBe('Extended Edition');
    expect(normalizeEditionLabel('Directors Cut').normalizedName).toBe("Director's Cut");
    expect(normalizeEditionLabel("Director's Cut").normalizedName).toBe("Director's Cut");
    expect(normalizeEditionLabel('Director Cut').normalizedName).toBe("Director's Cut");
    expect(normalizeEditionLabel('Final Cut').normalizedName).toBe('Final Cut');
    expect(normalizeEditionLabel('Theatrical Cut').normalizedName).toBe('Theatrical Cut');
    expect(normalizeEditionLabel('Theatrical Edition').normalizedName).toBe('Theatrical Cut');
    expect(normalizeEditionLabel('Special Edition').normalizedName).toBe('Special Edition');
    expect(normalizeEditionLabel('Unrated Cut').normalizedName).toBe('Unrated Cut');
    expect(normalizeEditionLabel('Unrated').normalizedName).toBe('Unrated Cut');
  });

  it('Test 6: Uncertain edition parsing surfaces needsReview', () => {
    const result = detectEdition('Blade.Runner.1982.Assembly.Cut.1080p.mkv');
    expect(result.normalizedName).toBe('Assembly Cut');
    expect(result.type).toBe('CUSTOM');
    expect(result.needsReview).toBe(true);
  });

  it('Test 7: Manual and custom edition assignment updates edition model', async () => {
    const repo = defaultInventoryRepository;
    const inventoryService = new InventoryService(repo, null);

    const movie = await repo.createMovie({
      title: 'Blade Runner Custom',
      year: 1982,
      status: 'UNMATCHED',
    });

    const edition = await repo.createEdition({
      movieId: movie.id,
      name: null,
      normalizedName: null,
      type: 'DEFAULT',
      needsReview: false,
    });

    const version = await repo.createMediaVersion({
      editionId: edition.id,
      name: '1080p BluRay',
    });

    await repo.createAsset({
      mediaVersionId: version.id,
      type: 'VIDEO',
      path: `/library/blade_runner_custom_${Date.now()}_${Math.random()}.mkv`,
      sizeBytes: 1000,
      mtime: new Date(),
    });

    // Assign custom edition
    const updatedMovie = await inventoryService.assignEdition({
      versionId: version.id,
      name: "Archival Director's Cut",
      custom: true,
    });

    expect(updatedMovie.editions).toHaveLength(1);
    const assignedEdition = updatedMovie.editions[0];
    expect(assignedEdition?.name).toBe("Archival Director's Cut");
    expect(assignedEdition?.normalizedName).toBe("Archival Director's Cut");
    expect(assignedEdition?.type).toBe('CUSTOM');
    expect(assignedEdition?.needsReview).toBe(false);
  });

  it('Test 8: Deterministic composed labels follow [Edition] - [Physical Version]', () => {
    const desc = {
      edition: 'Final Cut',
      resolution: '2160p',
      source: 'UHD BluRay',
    };
    expect(generateBaseVersionLabel(desc)).toBe('Final Cut - 2160p UHD BluRay');

    // Default edition omits edition prefix
    const descDefault = {
      edition: null,
      resolution: '1080p',
      source: 'BluRay',
    };
    expect(generateBaseVersionLabel(descDefault)).toBe('1080p BluRay');
  });

  it('Test 9 & 10: All editions remain under one Jellyfin folder with single canonical Movie row', () => {
    const movie: MovieWithHierarchy = {
      id: 'movie-canonical-1',
      title: 'Apocalypse Now',
      originalTitle: 'Apocalypse Now',
      year: 1979,
      runtimeMinutes: 147,
      overview: 'Vietnam war drama',
      status: 'MATCHED',
      matchConfidence: 1.0,
      matchDetails: null,
      tmdbId: 28,
      imdbId: 'tt0078788',
      createdAt: new Date(),
      updatedAt: new Date(),
      editions: [
        {
          id: 'ed-theatrical',
          movieId: 'movie-canonical-1',
          name: 'Theatrical Cut',
          normalizedName: 'Theatrical Cut',
          type: 'THEATRICAL',
          source: 'FILENAME',
          runtimeMinutes: 147,
          needsReview: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          mediaVersions: [
            {
              id: 'ver-th',
              editionId: 'ed-theatrical',
              name: '1080p BluRay',
              createdAt: new Date(),
              updatedAt: new Date(),
              assets: [
                {
                  id: 'asset-th',
                  mediaVersionId: 'ver-th',
                  type: 'VIDEO',
                  path: '/library/Apocalypse.Now.1979.Theatrical.1080p.mkv',
                  sizeBytes: BigInt(20000000000),
                  mtime: new Date(),
                  present: true,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  technicalMetadata: null,
                  filenameMetadata: {
                    id: 'fn-th',
                    assetId: 'asset-th',
                    title: 'Apocalypse Now',
                    year: 1979,
                    type: 'movie',
                    edition: 'Theatrical',
                    screenSize: '1080p',
                    source: 'BluRay',
                    videoCodec: null,
                    audioCodec: null,
                    audioChannels: null,
                    releaseGroup: null,
                    streamingService: null,
                    container: 'mkv',
                    language: null,
                    rawJson: '{}',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                },
              ],
            },
          ],
        },
        {
          id: 'ed-final',
          movieId: 'movie-canonical-1',
          name: 'Final Cut',
          normalizedName: 'Final Cut',
          type: 'FINAL_CUT',
          source: 'FILENAME',
          runtimeMinutes: 183,
          needsReview: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          mediaVersions: [
            {
              id: 'ver-fc',
              editionId: 'ed-final',
              name: '1080p BluRay',
              createdAt: new Date(),
              updatedAt: new Date(),
              assets: [
                {
                  id: 'asset-fc',
                  mediaVersionId: 'ver-fc',
                  type: 'VIDEO',
                  path: '/library/Apocalypse.Now.1979.Final.Cut.1080p.mkv',
                  sizeBytes: BigInt(25000000000),
                  mtime: new Date(),
                  present: true,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  technicalMetadata: null,
                  filenameMetadata: {
                    id: 'fn-fc',
                    assetId: 'asset-fc',
                    title: 'Apocalypse Now',
                    year: 1979,
                    type: 'movie',
                    edition: 'Final Cut',
                    screenSize: '1080p',
                    source: 'BluRay',
                    videoCodec: null,
                    audioCodec: null,
                    audioChannels: null,
                    releaseGroup: null,
                    streamingService: null,
                    container: 'mkv',
                    language: null,
                    rawJson: '{}',
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    const layout = profile.generateMovieLayout({
      movie,
      destinationRoot: '/Volumes/Movies',
    });

    // Exact single directory for the movie
    expect(layout.destinationDirectory).toBe('/Volumes/Movies/Apocalypse Now (1979) [tmdbid-28]');

    // All media files are in the exact same directory
    for (const mf of layout.mediaFiles) {
      expect(mf.destinationMediaPath.startsWith(layout.destinationDirectory)).toBe(true);
    }

    // Exact single movie.nfo
    expect(layout.sidecars).toHaveLength(1);
    expect(layout.sidecars[0]?.destinationPath).toBe(
      '/Volumes/Movies/Apocalypse Now (1979) [tmdbid-28]/movie.nfo',
    );
  });

  it('Test 11: Edition and physical-version dimensions remain separate in persistence', async () => {
    const repo = defaultInventoryRepository;
    const movie = await repo.createMovie({
      title: 'Dimension Separation Test',
      year: 2024,
      status: 'UNMATCHED',
    });

    const ed1 = await repo.createEdition({
      movieId: movie.id,
      name: "Director's Cut",
      normalizedName: "Director's Cut",
      type: 'DIRECTORS_CUT',
      source: 'FILENAME',
      runtimeMinutes: 140,
    });

    const _v1 = await repo.createMediaVersion({
      editionId: ed1.id,
      name: '2160p UHD BluRay',
    });

    const _v2 = await repo.createMediaVersion({
      editionId: ed1.id,
      name: '1080p BluRay',
    });

    const fetched = await repo.getMovie(movie.id);
    expect(fetched?.editions).toHaveLength(1);
    expect(fetched?.editions[0]?.normalizedName).toBe("Director's Cut");
    expect(fetched?.editions[0]?.runtimeMinutes).toBe(140);
    expect(fetched?.editions[0]?.mediaVersions).toHaveLength(2);
    expect(fetched?.editions[0]?.mediaVersions[0]?.name).toBe('2160p UHD BluRay');
    expect(fetched?.editions[0]?.mediaVersions[1]?.name).toBe('1080p BluRay');
  });
});
