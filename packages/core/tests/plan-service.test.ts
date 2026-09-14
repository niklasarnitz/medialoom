import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { defaultInventoryRepository, getPrismaClient, type Movie } from '@medialoom/db';

import { PlanService } from '../src';

describe('PlanService', () => {
  const prisma = getPrismaClient();
  const service = new PlanService();

  let tempDir: string;
  let sourceDir: string;
  let destinationDir: string;
  let sampleSourceFile: string;
  let matchedMovie: Movie;
  let unmatchedMovie: Movie;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'medialoom-service-test-'));
    sourceDir = path.join(tempDir, 'incoming');
    destinationDir = path.join(tempDir, 'movies');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(destinationDir, { recursive: true });

    sampleSourceFile = path.join(sourceDir, 'The.Matrix.1999.mkv');
    await fs.writeFile(sampleSourceFile, 'matrix video bytes');

    // Create a matched movie with full hierarchy
    const uniqueTmdbId = 888000 + Math.floor(Math.random() * 1000);
    matchedMovie = await defaultInventoryRepository.createMovie({
      title: 'The Matrix',
      originalTitle: 'The Matrix',
      year: 1999,
      status: 'MATCHED',
      tmdbId: uniqueTmdbId,
    });

    const edition = await defaultInventoryRepository.createEdition({
      movieId: matchedMovie.id,
      name: 'Theatrical',
    });

    const version = await defaultInventoryRepository.createMediaVersion({
      editionId: edition.id,
      name: '1080p',
    });

    await defaultInventoryRepository.createAsset({
      mediaVersionId: version.id,
      path: sampleSourceFile,
      sizeBytes: 1024,
      mtime: new Date(),
    });

    // Create an unmatched movie
    unmatchedMovie = await defaultInventoryRepository.createMovie({
      title: 'Unknown Movie',
      status: 'UNMATCHED',
    });
  });

  afterAll(async () => {
    if (matchedMovie) {
      await prisma.movie.delete({ where: { id: matchedMovie.id } }).catch(() => {});
    }
    if (unmatchedMovie) {
      await prisma.movie.delete({ where: { id: unmatchedMovie.id } }).catch(() => {});
    }
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('creates, validates, and persists an OperationPlan without altering the filesystem', async () => {
    // Record filesystem state before plan creation
    const destEntriesBefore = await fs.readdir(destinationDir);
    const sourceStatBefore = await fs.stat(sampleSourceFile);

    const plan = await service.createPlan({
      itemId: matchedMovie.id,
      profile: 'jellyfin',
      destination: destinationDir,
      validate: true,
    });

    // Assert plan structure and persistence
    expect(plan.id).toBeDefined();
    expect(plan.mediaItemId).toBe(matchedMovie.id);
    expect(plan.status).toBe('VALIDATED');
    expect(plan.operations.length).toBeGreaterThanOrEqual(2);
    expect(plan.validation?.valid).toBe(true);

    // ZERO FILESYSTEM MUTATIONS: verify destination folder and source file are completely untouched!
    const destEntriesAfter = await fs.readdir(destinationDir);
    expect(destEntriesAfter).toEqual(destEntriesBefore);

    const sourceStatAfter = await fs.stat(sampleSourceFile);
    expect(sourceStatAfter.size).toBe(sourceStatBefore.size);

    // Retrieve via service
    const fetched = await service.getPlan(plan.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(plan.id);
    expect(fetched?.status).toBe('VALIDATED');

    // List via service
    const list = await service.listPlans({ mediaItemId: matchedMovie.id });
    expect(list.some((p) => p.id === plan.id)).toBe(true);
  });

  it('rejects plan creation for unmatched movie', async () => {
    await expect(
      service.createPlan({
        itemId: unmatchedMovie.id,
        profile: 'jellyfin',
        destination: destinationDir,
      }),
    ).rejects.toThrow(/unmatched/i);
  });

  it('marks plan as FAILED when validation discovers errors (e.g. missing source)', async () => {
    // Create a movie whose asset points to a missing file
    const uniqueTmdbId2 = 889000 + Math.floor(Math.random() * 1000);
    const brokenMovie = await defaultInventoryRepository.createMovie({
      title: 'Inception',
      year: 2010,
      status: 'MATCHED',
      tmdbId: uniqueTmdbId2,
    });

    const edition = await defaultInventoryRepository.createEdition({
      movieId: brokenMovie.id,
    });

    const version = await defaultInventoryRepository.createMediaVersion({
      editionId: edition.id,
    });

    await defaultInventoryRepository.createAsset({
      mediaVersionId: version.id,
      path: path.join(sourceDir, 'non_existent_inception.mkv'),
      sizeBytes: 1024,
      mtime: new Date(),
    });

    const plan = await service.createPlan({
      itemId: brokenMovie.id,
      profile: 'jellyfin',
      destination: destinationDir,
      validate: true,
    });

    expect(plan.status).toBe('FAILED');
    expect(plan.validation?.valid).toBe(false);
    expect(plan.failureReason).toContain('does not exist');

    await prisma.movie.delete({ where: { id: brokenMovie.id } }).catch(() => {});
  });
});
