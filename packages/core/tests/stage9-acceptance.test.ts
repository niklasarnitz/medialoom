import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultInventoryRepository, type Movie } from '@medialoom/db';
import { PlanGenerator, PlanService, PlanValidator } from '../src';

describe('Stage 9 Acceptance Test: Persisted OperationPlan Generation & Validation', () => {
  const planService = new PlanService();
  const planGenerator = new PlanGenerator();
  const planValidator = new PlanValidator();

  let tempDir: string;
  let sourceDir: string;
  let destDir: string;
  let matrixVideoFile: string;
  let matrixMovie: Movie;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'medialoom-stage9-acceptance-'));
    sourceDir = path.join(tempDir, 'incoming');
    destDir = path.join(tempDir, 'movies');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(destDir, { recursive: true });

    matrixVideoFile = path.join(sourceDir, 'The.Matrix.1999.mkv');
    await fs.writeFile(matrixVideoFile, 'matrix test movie data');

    const uniqueTmdbId = 999123 + Math.floor(Math.random() * 1000);
    matrixMovie = await defaultInventoryRepository.createMovie({
      title: 'The Matrix',
      originalTitle: 'The Matrix',
      year: 1999,
      runtimeMinutes: 136,
      overview: 'Set in the 22nd century, The Matrix tells the story of a computer hacker...',
      status: 'MATCHED',
      matchConfidence: 0.98,
      tmdbId: uniqueTmdbId,
      imdbId: `tt0133093_${uniqueTmdbId}`,
    });

    const edition = await defaultInventoryRepository.createEdition({
      movieId: matrixMovie.id,
      name: 'Theatrical',
    });

    const version = await defaultInventoryRepository.createMediaVersion({
      editionId: edition.id,
      name: '1080p BluRay',
    });

    await defaultInventoryRepository.createAsset({
      mediaVersionId: version.id,
      path: matrixVideoFile,
      sizeBytes: 4500000000,
      mtime: new Date(),
    });
  });

  afterAll(async () => {
    if (matrixMovie) {
      await defaultInventoryRepository.deleteMovie(matrixMovie.id).catch(() => {});
    }
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('generates exact operation output for a known movie (The Matrix 1999)', async () => {
    const movieWithHierarchy = await defaultInventoryRepository.getMovie(matrixMovie.id);
    expect(movieWithHierarchy).not.toBeNull();
    if (!movieWithHierarchy) return;

    const { operations, layout } = planGenerator.generateOperations({
      movie: movieWithHierarchy,
      destinationRoot: destDir,
      profile: 'jellyfin',
    });

    expect(layout.directory).toBe(`The Matrix (1999) [tmdbid-${matrixMovie.tmdbId}]`);

    const expectedFolder = path.join(destDir, `The Matrix (1999) [tmdbid-${matrixMovie.tmdbId}]`);
    const expectedMedia = path.join(
      expectedFolder,
      `The Matrix (1999) [tmdbid-${matrixMovie.tmdbId}].mkv`,
    );
    const expectedNfo = path.join(expectedFolder, 'movie.nfo');

    expect(operations).toHaveLength(3);

    // 1. mkdir
    expect(operations[0]).toEqual({
      type: 'mkdir',
      path: expectedFolder,
      metadata: {
        directory: `The Matrix (1999) [tmdbid-${matrixMovie.tmdbId}]`,
      },
    });

    // 2. move
    expect(operations[1]).toEqual({
      type: 'move',
      source: matrixVideoFile,
      destination: expectedMedia,
      metadata: {
        filename: `The Matrix (1999) [tmdbid-${matrixMovie.tmdbId}].mkv`,
        relativeMediaPath: `The Matrix (1999) [tmdbid-${matrixMovie.tmdbId}]/The Matrix (1999) [tmdbid-${matrixMovie.tmdbId}].mkv`,
      },
    });

    // 3. writeText
    expect(operations[2]?.type).toBe('writeText');
    if (operations[2]?.type === 'writeText') {
      expect(operations[2].path).toBe(expectedNfo);
      expect(operations[2].content).toContain('<title>The Matrix</title>');
      expect(operations[2].content).toContain(
        `<uniqueid type="tmdb" default="true">${matrixMovie.tmdbId}</uniqueid>`,
      );
    }
  });

  it('guarantees plan creation causes ZERO filesystem mutations', async () => {
    const destEntriesBefore = await fs.readdir(destDir);
    const sourceStatBefore = await fs.stat(matrixVideoFile);

    const plan = await planService.createPlan({
      itemId: matrixMovie.id,
      profile: 'jellyfin',
      destination: destDir,
      validate: true,
    });

    expect(plan.id).toBeDefined();
    expect(plan.status).toBe('VALIDATED');

    // Verify filesystem was NOT modified in any way
    const destEntriesAfter = await fs.readdir(destDir);
    expect(destEntriesAfter).toEqual(destEntriesBefore);

    const sourceStatAfter = await fs.stat(matrixVideoFile);
    expect(sourceStatAfter.mtimeMs).toBe(sourceStatBefore.mtimeMs);
    expect(sourceStatAfter.size).toBe(sourceStatBefore.size);
  });

  it('validates read-only: source missing', async () => {
    const valResult = await planValidator.validate({
      operations: [
        {
          type: 'mkdir',
          path: path.join(destDir, 'Folder'),
        },
        {
          type: 'move',
          source: path.join(sourceDir, 'non-existent.mkv'),
          destination: path.join(destDir, 'Folder', 'Movie.mkv'),
        },
      ],
      destinationRoot: destDir,
    });

    expect(valResult.valid).toBe(false);
    expect(valResult.issues.some((i) => i.code === 'SOURCE_NOT_FOUND')).toBe(true);
  });

  it('validates read-only: destination collision', async () => {
    const existingFile = path.join(destDir, 'already-exists.mkv');
    await fs.writeFile(existingFile, 'existing');

    const valResult = await planValidator.validate({
      operations: [
        {
          type: 'move',
          source: matrixVideoFile,
          destination: existingFile,
        },
      ],
      destinationRoot: destDir,
    });

    expect(valResult.valid).toBe(false);
    expect(valResult.issues.some((i) => i.code === 'DESTINATION_COLLISION')).toBe(true);

    await fs.unlink(existingFile);
  });

  it('validates read-only: malicious path / traversal', async () => {
    const valResult = await planValidator.validate({
      operations: [
        {
          type: 'mkdir',
          path: `${destDir}/foo/../bar`,
        },
      ],
      destinationRoot: destDir,
    });

    expect(valResult.valid).toBe(false);

    expect(valResult.issues.some((i) => i.code === 'PATH_TRAVERSAL')).toBe(true);
  });

  it('validates read-only: destination root escape', async () => {
    const valResult = await planValidator.validate({
      operations: [
        {
          type: 'writeText',
          path: '/etc/evil.nfo',
          content: 'bad',
        },
      ],
      destinationRoot: destDir,
    });

    expect(valResult.valid).toBe(false);
    expect(valResult.issues.some((i) => i.code === 'DESTINATION_ROOT_ESCAPE')).toBe(true);
  });

  it('validates read-only: duplicate destination in plan', async () => {
    const targetFile = path.join(destDir, 'duplicate.nfo');
    const valResult = await planValidator.validate({
      operations: [
        {
          type: 'writeText',
          path: targetFile,
          content: 'first',
        },
        {
          type: 'writeText',
          path: targetFile,
          content: 'second',
        },
      ],
      destinationRoot: destDir,
    });

    expect(valResult.valid).toBe(false);
    expect(valResult.issues.some((i) => i.code === 'DUPLICATE_DESTINATION')).toBe(true);
  });

  it('persists and retrieves OperationPlan with lifecycle status transitions', async () => {
    const created = await planService.createPlan({
      itemId: matrixMovie.id,
      profile: 'jellyfin',
      destination: destDir,
      validate: true,
    });

    expect(created.status).toBe('VALIDATED');
    expect(created.validatedAt).toBeDefined();

    const fetched = await planService.getPlan(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.operations).toHaveLength(3);

    const listed = await planService.listPlans({ status: 'VALIDATED' });
    expect(listed.some((p) => p.id === created.id)).toBe(true);
  });
});
