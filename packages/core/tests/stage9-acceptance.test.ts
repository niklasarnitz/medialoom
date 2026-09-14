import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultInventoryRepository } from '@medialoom/db';
import {
  InventoryService,
  MatchingService,
  type MetadataService,
  PlanGenerator,
  PlanService,
  PlanValidator,
} from '../src';

describe('Stage 9 Acceptance: Multiple Physical Movie Versions / Rips', () => {
  let tempDir: string;
  let incomingDir: string;
  let destDir: string;

  let matrixBluRayFile: string;
  let matrixDvdFile: string;
  let bladeRunner4kFile: string;
  let bladeRunner1080pFile: string;

  const mockInspector = {
    async inspect(filePath: string) {
      if (filePath.includes('1080p.BluRay')) {
        return {
          sizeBytes: 8500000000,
          container: 'matroska',
          formatName: 'matroska',
          durationSeconds: 8160,
          bitRate: 8500000,
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
          rawJson: '{}',
          videoStreams: [],
          audioStreams: [],
          subtitleStreams: [],
          allStreams: [],
        };
      }
      if (filePath.includes('DVD')) {
        return {
          sizeBytes: 2100000000,
          container: 'matroska',
          formatName: 'matroska',
          durationSeconds: 8160,
          bitRate: 2100000,
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
          rawJson: '{}',
          videoStreams: [],
          audioStreams: [],
          subtitleStreams: [],
          allStreams: [],
        };
      }
      if (filePath.includes('2160p.UHD')) {
        return {
          sizeBytes: 25000000000,
          container: 'matroska',
          formatName: 'matroska',
          durationSeconds: 7020,
          bitRate: 25000000,
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
          rawJson: '{}',
          videoStreams: [],
          audioStreams: [],
          subtitleStreams: [],
          allStreams: [],
        };
      }
      return {
        sizeBytes: 8000000000,
        container: 'matroska',
        formatName: 'matroska',
        durationSeconds: 7020,
        bitRate: 8000000,
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
        rawJson: '{}',
        videoStreams: [],
        audioStreams: [],
        subtitleStreams: [],
        allStreams: [],
      };
    },
  };

  const inventoryService = new InventoryService(defaultInventoryRepository, mockInspector);
  const planService = new PlanService();
  const planGenerator = new PlanGenerator();
  const planValidator = new PlanValidator();

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'medialoom-stage9-acceptance-'));
    incomingDir = path.join(tempDir, 'incoming');
    destDir = path.join(tempDir, 'movies');

    await fs.mkdir(incomingDir, { recursive: true });
    await fs.mkdir(destDir, { recursive: true });

    matrixBluRayFile = path.join(incomingDir, 'The.Matrix.1999.1080p.BluRay.x264.mkv');
    matrixDvdFile = path.join(incomingDir, 'The.Matrix.1999.DVD.x264.mkv');
    bladeRunner4kFile = path.join(incomingDir, 'Blade.Runner.1982.2160p.UHD.BluRay.x265.mkv');
    bladeRunner1080pFile = path.join(incomingDir, 'Blade.Runner.1982.1080p.BluRay.x264.mkv');

    await fs.writeFile(matrixBluRayFile, 'matrix bluray video mock');
    await fs.writeFile(matrixDvdFile, 'matrix dvd video mock');
    await fs.writeFile(bladeRunner4kFile, 'blade runner 4k mock');
    await fs.writeFile(bladeRunner1080pFile, 'blade runner 1080p mock');
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('Requirement 1, 5, 8, 9, 10: Blu-ray + DVD of same movie consolidate to 1 canonical Movie row with multiple versions and exact Jellyfin layout', async () => {
    const existingMatrix = await defaultInventoryRepository.findMovieByTmdbId(603);
    if (existingMatrix) {
      await defaultInventoryRepository.deleteMovie(existingMatrix.id);
    }

    // 1. Discover and scan incoming files
    const scanResult = await inventoryService.scan(incomingDir);
    expect(scanResult.discovered).toBeGreaterThanOrEqual(2);

    const canonicalIncoming = await fs.realpath(incomingDir);

    // List all scanned items belonging to this test's incomingDir
    const items = await inventoryService.listItems();
    const matrixItems = items.filter((i) =>
      (i.editions ?? []).some((e) =>
        (e.mediaVersions ?? []).some((v) =>
          (v.assets ?? []).some(
            (a) => a.path.startsWith(canonicalIncoming) && a.path.includes('Matrix'),
          ),
        ),
      ),
    );
    expect(matrixItems.length).toBe(2);

    const [item1, item2] = matrixItems;
    if (!item1 || !item2) throw new Error('Expected 2 matrix items');

    // 2. Mock Metadata Provider matching both items to TMDb ID 603
    const mockMetadataService = {
      async getCandidatesForItem(_itemId: string) {
        return {
          item: item1,
          query: 'The Matrix',
          year: 1999,
          candidates: [
            {
              provider: 'tmdb',
              providerId: '603',
              title: 'The Matrix',
              originalTitle: 'The Matrix',
              year: 1999,
              runtimeMinutes: 136,
              overview: 'A computer hacker learns about the true nature of reality.',
              tmdbId: 603,
              imdbId: 'tt0133093',
            },
          ],
        };
      },
      async getMovie(providerId: string | number) {
        return {
          provider: 'tmdb',
          providerId: String(providerId),
          title: 'The Matrix',
          originalTitle: 'The Matrix',
          year: 1999,
          runtimeMinutes: 136,
          overview: 'A computer hacker learns about the true nature of reality.',
          tmdbId: 603,
          imdbId: 'tt0133093',
        };
      },
    } as unknown as MetadataService;

    const matchingService = new MatchingService({
      metadataService: mockMetadataService,
      inventoryRepo: defaultInventoryRepository,
    });

    // Match first item
    const matchRes1 = await matchingService.matchItem(item1.id);
    expect(matchRes1.decision).toBe('AUTO_MATCH');

    // Match second item (should consolidate into the canonical Movie)
    const matchRes2 = await matchingService.matchItem(item2.id);
    expect(matchRes2.decision).toBe('AUTO_MATCH');

    // Requirement 9: Verify ONLY ONE canonical Movie row exists in DB for TMDb ID 603
    const canonicalMovie = await defaultInventoryRepository.findMovieByTmdbId(603);
    expect(canonicalMovie).not.toBeNull();
    if (!canonicalMovie) return;

    // Requirement 10: Both physical versions survive persistence under the canonical Movie
    expect(canonicalMovie.editions).toHaveLength(1);
    const edition = canonicalMovie.editions[0];
    if (!edition) throw new Error('Expected edition');
    expect(edition.mediaVersions).toHaveLength(2);

    // 3. Generate Jellyfin Layout Plan
    const { operations, layout } = planGenerator.generateOperations({
      movie: canonicalMovie,
      destinationRoot: destDir,
      profile: 'jellyfin',
    });

    // Requirement 8: Exact folder name and common prefix
    const expectedFolderName = 'The Matrix (1999) [tmdbid-603]';
    expect(layout.directory).toBe(expectedFolderName);
    expect(layout.destinationDirectory).toBe(path.resolve(destDir, expectedFolderName));

    expect(layout.mediaFiles).toHaveLength(2);

    const blurayFilePlan = layout.mediaFiles.find((f) => f.mediaFilename.includes('1080p BluRay'));
    const dvdFilePlan = layout.mediaFiles.find((f) => f.mediaFilename.includes('576p DVD'));

    const canonicalBluRay = await fs.realpath(matrixBluRayFile);
    const canonicalDvd = await fs.realpath(matrixDvdFile);

    expect(blurayFilePlan).toBeDefined();
    expect(blurayFilePlan?.mediaFilename).toBe(`${expectedFolderName} - 1080p BluRay.mkv`);
    expect(blurayFilePlan?.sourceMediaPath).toBe(canonicalBluRay);
    expect(blurayFilePlan?.destinationMediaPath).toBe(
      path.resolve(destDir, expectedFolderName, `${expectedFolderName} - 1080p BluRay.mkv`),
    );

    expect(dvdFilePlan).toBeDefined();
    expect(dvdFilePlan?.mediaFilename).toBe(`${expectedFolderName} - 576p DVD.mkv`);
    expect(dvdFilePlan?.sourceMediaPath).toBe(canonicalDvd);
    expect(dvdFilePlan?.destinationMediaPath).toBe(
      path.resolve(destDir, expectedFolderName, `${expectedFolderName} - 576p DVD.mkv`),
    );

    // Shared sidecar (movie.nfo)
    expect(layout.sidecars).toHaveLength(1);
    expect(layout.sidecars[0]?.filename).toBe('movie.nfo');

    // 4. Verify OperationPlan operations & validation
    expect(operations).toHaveLength(4);
    expect(operations[0]?.type).toBe('mkdir');
    expect(operations[1]?.type).toBe('move');
    expect(operations[2]?.type).toBe('move');
    expect(operations[3]?.type).toBe('writeText');

    const valResult = await planValidator.validate({
      operations,
      destinationRoot: destDir,
    });
    expect(valResult.valid).toBe(true);
    expect(valResult.issues).toHaveLength(0);

    // 5. Verify OperationPlan persistence
    const savedPlan = await planService.createPlan({
      itemId: canonicalMovie.id,
      profile: 'jellyfin',
      destination: destDir,
      validate: true,
    });
    expect(savedPlan.status).toBe('VALIDATED');
    expect(savedPlan.operations).toHaveLength(4);

    // Clean up DB for next assertions
    await defaultInventoryRepository.deleteMovie(canonicalMovie.id);
  });

  it('Requirement 2: 2160p + 1080p of same movie generates UHD BluRay and BluRay labels', async () => {
    const tmdbId = 987001;
    const existing = await defaultInventoryRepository.findMovieByTmdbId(tmdbId);
    if (existing) await defaultInventoryRepository.deleteMovie(existing.id);

    const movie = await defaultInventoryRepository.createMovie({
      title: 'Blade Runner',
      year: 1982,
      status: 'MATCHED',
      tmdbId,
    });

    const edition = await defaultInventoryRepository.createEdition({
      movieId: movie.id,
      name: null,
    });

    const v1 = await defaultInventoryRepository.createMediaVersion({
      editionId: edition.id,
      name: '2160p UHD BluRay',
    });
    const a1 = await defaultInventoryRepository.createAsset({
      mediaVersionId: v1.id,
      path: bladeRunner4kFile,
      sizeBytes: 25000000000,
      mtime: new Date(),
    });
    await defaultInventoryRepository.setFilenameMetadata({
      assetId: a1.id,
      source: 'UHD Blu-ray',
      screenSize: '2160p',
      videoCodec: 'x265',
    });
    await defaultInventoryRepository.setTechnicalMetadata({
      assetId: a1.id,
      width: 3840,
      height: 2160,
      videoCodec: 'hevc',
      hdrFormat: 'HDR10',
    });

    const v2 = await defaultInventoryRepository.createMediaVersion({
      editionId: edition.id,
      name: '1080p BluRay',
    });
    const a2 = await defaultInventoryRepository.createAsset({
      mediaVersionId: v2.id,
      path: bladeRunner1080pFile,
      sizeBytes: 10000000000,
      mtime: new Date(),
    });
    await defaultInventoryRepository.setFilenameMetadata({
      assetId: a2.id,
      source: 'Blu-ray',
      screenSize: '1080p',
      videoCodec: 'x264',
    });
    await defaultInventoryRepository.setTechnicalMetadata({
      assetId: a2.id,
      width: 1920,
      height: 1080,
      videoCodec: 'h264',
    });

    const fullMovie = await defaultInventoryRepository.getMovie(movie.id);
    if (!fullMovie) throw new Error('Movie not found');

    const { layout } = planGenerator.generateOperations({
      movie: fullMovie,
      destinationRoot: destDir,
      profile: 'jellyfin',
    });

    expect(layout.mediaFiles).toHaveLength(2);
    const filenames = layout.mediaFiles.map((f) => f.mediaFilename);
    expect(filenames).toContain(`Blade Runner (1982) [tmdbid-${tmdbId}] - 2160p UHD BluRay.mkv`);
    expect(filenames).toContain(`Blade Runner (1982) [tmdbid-${tmdbId}] - 1080p BluRay.mkv`);

    await defaultInventoryRepository.deleteMovie(movie.id);
  });

  it('Requirement 3: two 1080p versions with different sources (BluRay vs WEB-DL)', async () => {
    const tmdbId = 987002;
    const existing = await defaultInventoryRepository.findMovieByTmdbId(tmdbId);
    if (existing) await defaultInventoryRepository.deleteMovie(existing.id);

    const movie = await defaultInventoryRepository.createMovie({
      title: 'Inception',
      year: 2010,
      status: 'MATCHED',
      tmdbId,
    });
    const edition = await defaultInventoryRepository.createEdition({ movieId: movie.id });

    const v1 = await defaultInventoryRepository.createMediaVersion({ editionId: edition.id });
    const a1 = await defaultInventoryRepository.createAsset({
      mediaVersionId: v1.id,
      path: '/media/Inception.2010.1080p.BluRay.mkv',
      sizeBytes: 8000000000,
      mtime: new Date(),
    });
    await defaultInventoryRepository.setFilenameMetadata({
      assetId: a1.id,
      source: 'Blu-ray',
      screenSize: '1080p',
    });

    const v2 = await defaultInventoryRepository.createMediaVersion({ editionId: edition.id });
    const a2 = await defaultInventoryRepository.createAsset({
      mediaVersionId: v2.id,
      path: '/media/Inception.2010.1080p.WEB-DL.mkv',
      sizeBytes: 4000000000,
      mtime: new Date(),
    });
    await defaultInventoryRepository.setFilenameMetadata({
      assetId: a2.id,
      source: 'WEB-DL',
      screenSize: '1080p',
    });

    const fullMovie = await defaultInventoryRepository.getMovie(movie.id);
    if (!fullMovie) throw new Error('Movie not found');

    const { layout } = planGenerator.generateOperations({
      movie: fullMovie,
      destinationRoot: destDir,
      profile: 'jellyfin',
    });

    const filenames = layout.mediaFiles.map((f) => f.mediaFilename);
    expect(filenames).toContain(`Inception (2010) [tmdbid-${tmdbId}] - 1080p BluRay.mkv`);
    expect(filenames).toContain(`Inception (2010) [tmdbid-${tmdbId}] - 1080p WEB-DL.mkv`);

    await defaultInventoryRepository.deleteMovie(movie.id);
  });

  it('Requirement 4 & 6: identical resolution/source but different codec collision resolution', async () => {
    const tmdbId = 987003;
    const existing = await defaultInventoryRepository.findMovieByTmdbId(tmdbId);
    if (existing) await defaultInventoryRepository.deleteMovie(existing.id);

    const movie = await defaultInventoryRepository.createMovie({
      title: 'Interstellar',
      year: 2014,
      status: 'MATCHED',
      tmdbId,
    });
    const edition = await defaultInventoryRepository.createEdition({ movieId: movie.id });

    const v1 = await defaultInventoryRepository.createMediaVersion({ editionId: edition.id });
    const a1 = await defaultInventoryRepository.createAsset({
      mediaVersionId: v1.id,
      path: '/media/Interstellar.2014.1080p.BluRay.x264.mkv',
      sizeBytes: 8000000000,
      mtime: new Date(),
    });
    await defaultInventoryRepository.setFilenameMetadata({
      assetId: a1.id,
      source: 'Blu-ray',
      screenSize: '1080p',
      videoCodec: 'x264',
    });
    await defaultInventoryRepository.setTechnicalMetadata({
      assetId: a1.id,
      width: 1920,
      height: 1080,
      videoCodec: 'h264',
    });

    const v2 = await defaultInventoryRepository.createMediaVersion({ editionId: edition.id });
    const a2 = await defaultInventoryRepository.createAsset({
      mediaVersionId: v2.id,
      path: '/media/Interstellar.2014.1080p.BluRay.HEVC.mkv',
      sizeBytes: 4000000000,
      mtime: new Date(),
    });
    await defaultInventoryRepository.setFilenameMetadata({
      assetId: a2.id,
      source: 'Blu-ray',
      screenSize: '1080p',
      videoCodec: 'HEVC',
    });
    await defaultInventoryRepository.setTechnicalMetadata({
      assetId: a2.id,
      width: 1920,
      height: 1080,
      videoCodec: 'hevc',
    });

    const fullMovie = await defaultInventoryRepository.getMovie(movie.id);
    if (!fullMovie) throw new Error('Movie not found');

    const { layout } = planGenerator.generateOperations({
      movie: fullMovie,
      destinationRoot: destDir,
      profile: 'jellyfin',
    });

    const filenames = layout.mediaFiles.map((f) => f.mediaFilename);
    expect(filenames).toContain(`Interstellar (2014) [tmdbid-${tmdbId}] - 1080p BluRay x264.mkv`);
    expect(filenames).toContain(`Interstellar (2014) [tmdbid-${tmdbId}] - 1080p BluRay HEVC.mkv`);

    await defaultInventoryRepository.deleteMovie(movie.id);
  });

  it('Requirement 7: deterministic output produces identical results across runs', async () => {
    const tmdbId = 987004;
    const existing = await defaultInventoryRepository.findMovieByTmdbId(tmdbId);
    if (existing) await defaultInventoryRepository.deleteMovie(existing.id);

    const movie = await defaultInventoryRepository.createMovie({
      title: 'Gladiator',
      year: 2000,
      status: 'MATCHED',
      tmdbId,
    });
    const edition = await defaultInventoryRepository.createEdition({ movieId: movie.id });
    const v1 = await defaultInventoryRepository.createMediaVersion({ editionId: edition.id });
    const a1 = await defaultInventoryRepository.createAsset({
      mediaVersionId: v1.id,
      path: '/media/Gladiator.2000.1080p.BluRay.mkv',
      sizeBytes: 8000000000,
      mtime: new Date(),
    });
    await defaultInventoryRepository.setFilenameMetadata({
      assetId: a1.id,
      source: 'Blu-ray',
      screenSize: '1080p',
    });

    const fullMovie = await defaultInventoryRepository.getMovie(movie.id);
    if (!fullMovie) throw new Error('Movie not found');

    const run1 = planGenerator.generateOperations({
      movie: fullMovie,
      destinationRoot: destDir,
      profile: 'jellyfin',
    });

    const run2 = planGenerator.generateOperations({
      movie: fullMovie,
      destinationRoot: destDir,
      profile: 'jellyfin',
    });

    expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));

    await defaultInventoryRepository.deleteMovie(movie.id);
  });
});
