import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  defaultInventoryRepository,
  defaultPlanRepository,
  defaultReviewRepository,
  getPrismaClient,
  type MovieWithHierarchy,
} from '@medialoom/db';
import { PlanExecutor, PlanService, ReviewNotApprovedError, ReviewService } from '../src';

describe('Review Queue Application Service', () => {
  const prisma = getPrismaClient();
  const reviewRepo = defaultReviewRepository;
  const planRepo = defaultPlanRepository;
  const inventoryRepo = defaultInventoryRepository;

  const reviewService = new ReviewService({ reviewRepo, planRepo, inventoryRepo });
  const planService = new PlanService({
    inventoryRepo,
    planRepo,
    reviewService,
  });
  const planExecutor = new PlanExecutor({ planRepo, reviewRepo, inventoryRepo });

  let tmpDir: string;
  let incomingDir: string;
  let targetDir: string;
  let testMovie: MovieWithHierarchy;
  let sampleFilePath: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medialoom-review-test-'));
    incomingDir = path.join(tmpDir, 'incoming');
    targetDir = path.join(tmpDir, 'movies');
    fs.mkdirSync(incomingDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });

    sampleFilePath = path.join(incomingDir, 'Blade.Runner.1982.Final.Cut.2160p.mkv');
    fs.writeFileSync(sampleFilePath, 'dummy video content');

    const uniqueTmdbId = 999300 + Math.floor(Math.random() * 1000);
    const movie = await inventoryRepo.createMovie({
      title: 'Blade Runner',
      year: 1982,
      status: 'MATCHED',
      tmdbId: uniqueTmdbId,
    });

    const edition = await inventoryRepo.createEdition({
      movieId: movie.id,
      name: 'Final Cut',
      normalizedName: 'Final Cut',
      type: 'FINAL_CUT',
    });

    const version = await inventoryRepo.createMediaVersion({
      editionId: edition.id,
      name: '2160p UHD BluRay',
    });

    await inventoryRepo.createAsset({
      mediaVersionId: version.id,
      path: sampleFilePath,
      sizeBytes: 19,
      mtime: new Date(),
    });

    const fetched = await inventoryRepo.getMovie(movie.id);
    if (!fetched) throw new Error('Failed to create test movie');
    testMovie = fetched;
  });

  afterAll(async () => {
    if (testMovie) {
      await prisma.movie.delete({ where: { id: testMovie.id } }).catch(() => {});
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1. generating desired organization creates queue item', async () => {
    const plan = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
      validate: true,
    });

    expect(plan.id).toBeDefined();

    const reviewItem = await reviewService.getReviewItemByPlanId(plan.id);
    expect(reviewItem).not.toBeNull();
    expect(reviewItem?.status).toBe('PENDING');
    expect(reviewItem?.type).toBe('FILESYSTEM_CHANGE');
    expect(reviewItem?.operationPlanId).toBe(plan.id);
    expect(reviewItem?.mediaItemId).toBe(testMovie.id);
  });

  it('2. generating queue item mutates no user files', async () => {
    // Verify source file still exists untouched in incomingDir
    expect(fs.existsSync(sampleFilePath)).toBe(true);
    expect(fs.readFileSync(sampleFilePath, 'utf8')).toBe('dummy video content');

    // Verify destination dir has not received any files yet
    const targetFiles = fs.readdirSync(targetDir);
    expect(targetFiles).toHaveLength(0);
  });

  it('3. pending item cannot execute', async () => {
    const plan = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const reviewItem = await reviewService.getReviewItemByPlanId(plan.id);
    expect(reviewItem).not.toBeNull();
    if (!reviewItem) throw new Error('Expected reviewItem');

    await expect(planExecutor.executePlan(plan.id)).rejects.toThrow(ReviewNotApprovedError);
    await expect(planExecutor.executeReviewItem(reviewItem.id)).rejects.toThrow(
      ReviewNotApprovedError,
    );

    // Source file must still exist and target empty
    expect(fs.existsSync(sampleFilePath)).toBe(true);
    expect(fs.readdirSync(targetDir)).toHaveLength(0);
  });

  it('4. rejected item cannot execute', async () => {
    const plan = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const reviewItem = await reviewService.getReviewItemByPlanId(plan.id);
    expect(reviewItem).not.toBeNull();
    if (!reviewItem) throw new Error('Expected reviewItem');

    const rejected = await reviewService.rejectReviewItem(reviewItem.id);
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectedAt).toBeDefined();

    await expect(planExecutor.executePlan(plan.id)).rejects.toThrow(ReviewNotApprovedError);
    await expect(planExecutor.executeReviewItem(rejected.id)).rejects.toThrow(
      ReviewNotApprovedError,
    );

    // No files mutated
    expect(fs.existsSync(sampleFilePath)).toBe(true);
    expect(fs.readdirSync(targetDir)).toHaveLength(0);
  });

  it('5. approved item becomes executable and applies operations', async () => {
    // Create a dedicated movie & file for execution test to avoid affecting other tests
    const execFile = path.join(incomingDir, 'Blade.Runner.Exec.mkv');
    fs.writeFileSync(execFile, 'execution test movie data');

    const uniqueTmdbId = 999400 + Math.floor(Math.random() * 1000);
    const execMovie = await inventoryRepo.createMovie({
      title: 'Blade Runner Exec',
      year: 1982,
      status: 'MATCHED',
      tmdbId: uniqueTmdbId,
    });
    const edition = await inventoryRepo.createEdition({
      movieId: execMovie.id,
      name: 'Theatrical Cut',
    });
    const version = await inventoryRepo.createMediaVersion({
      editionId: edition.id,
      name: '1080p',
    });
    await inventoryRepo.createAsset({
      mediaVersionId: version.id,
      path: execFile,
      sizeBytes: 25,
      mtime: new Date(),
    });

    const plan = await planService.createPlan({
      itemId: execMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const reviewItem = await reviewService.getReviewItemByPlanId(plan.id);
    expect(reviewItem?.status).toBe('PENDING');
    if (!reviewItem) throw new Error('Expected reviewItem');

    const approved = await reviewService.approveReviewItem(reviewItem.id);
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedAt).toBeDefined();

    // Now execute!
    const result = await planExecutor.executeReviewItem(approved.id);
    expect(result.plan.status).toBe('APPLIED');
    expect(result.reviewItem.status).toBe('APPLIED');
    expect(result.executedOperations).toBeGreaterThan(0);

    // Old source file was moved
    expect(fs.existsSync(execFile)).toBe(false);

    // Check movie folder was created in targetDir and contains moved media + movie.nfo
    const movieDirs = fs.readdirSync(targetDir);
    expect(movieDirs.some((d) => d.includes('Blade Runner Exec'))).toBe(true);

    const movieDirName = movieDirs.find((d) => d.includes('Blade Runner Exec'));
    if (!movieDirName) throw new Error('Expected movieDirName');
    const movieDirContents = fs.readdirSync(path.join(targetDir, movieDirName));
    expect(movieDirContents.some((f) => f.endsWith('.mkv'))).toBe(true);
    expect(movieDirContents.some((f) => f === 'movie.nfo')).toBe(true);

    // Clean up
    await prisma.movie.delete({ where: { id: execMovie.id } }).catch(() => {});
  });

  it('6. approval does not itself unexpectedly execute without separate apply action', async () => {
    const noExecFile = path.join(incomingDir, 'NoExec.mkv');
    fs.writeFileSync(noExecFile, 'no execute on approve test');

    const uniqueTmdbId = 999500 + Math.floor(Math.random() * 1000);
    const noExecMovie = await inventoryRepo.createMovie({
      title: 'NoExec Movie',
      year: 2020,
      status: 'MATCHED',
      tmdbId: uniqueTmdbId,
    });
    const ed = await inventoryRepo.createEdition({ movieId: noExecMovie.id });
    const ver = await inventoryRepo.createMediaVersion({ editionId: ed.id });
    await inventoryRepo.createAsset({
      mediaVersionId: ver.id,
      path: noExecFile,
      sizeBytes: 26,
      mtime: new Date(),
    });

    const plan = await planService.createPlan({
      itemId: noExecMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const reviewItem = await reviewService.getReviewItemByPlanId(plan.id);
    if (!reviewItem) throw new Error('Expected reviewItem');
    const approved = await reviewService.approveReviewItem(reviewItem.id);
    expect(approved.status).toBe('APPROVED');

    // Source file must STILL exist untouched
    expect(fs.existsSync(noExecFile)).toBe(true);

    await prisma.movie.delete({ where: { id: noExecMovie.id } }).catch(() => {});
  });

  it('7. queue survives process restart / separate service instance', async () => {
    const plan = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const reviewItem = await reviewService.getReviewItemByPlanId(plan.id);
    expect(reviewItem).not.toBeNull();
    if (!reviewItem) throw new Error('Expected reviewItem');

    // Instantiate a new ReviewService instance representing new process
    const freshReviewService = new ReviewService({ reviewRepo, planRepo, inventoryRepo });
    const fetched = await freshReviewService.getReviewItem(reviewItem.id);

    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(reviewItem?.id);
    expect(fetched?.operationPlanId).toBe(plan.id);
    expect(fetched?.title).toBe(reviewItem?.title);
    expect(fetched?.summary).toBe(reviewItem?.summary);
  });

  it('8. queue exposes exact proposed changes and structured summary', async () => {
    const plan = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const item = await reviewService.getReviewItemByPlanId(plan.id);
    expect(item).not.toBeNull();
    expect(item?.details).toBeDefined();
    expect(item?.details?.affectedMovie?.title).toBe('Blade Runner');
    expect(item?.details?.destinationRoot).toBe(targetDir);
    expect(item?.details?.filesToMove.length).toBeGreaterThan(0);
    expect(item?.details?.filesToWrite.length).toBeGreaterThan(0);

    // Summary formatting
    expect(item?.summary).toContain('Blade Runner');
    expect(item?.summary).toContain('reorganized');
    expect(item?.summary).toContain('MOVE');
    expect(item?.summary).toContain('WRITE');
  });

  it('9 & 10. several queue items remain independent; approving one does not approve others', async () => {
    const planA = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const planB = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const itemA = await reviewService.getReviewItemByPlanId(planA.id);
    const itemB = await reviewService.getReviewItemByPlanId(planB.id);

    expect(itemA?.id).not.toBe(itemB?.id);
    expect(itemA?.status).toBe('PENDING');
    expect(itemB?.status).toBe('PENDING');
    if (!itemA || !itemB) throw new Error('Expected items');

    const approvedA = await reviewService.approveReviewItem(itemA.id);
    expect(approvedA.status).toBe('APPROVED');

    const refreshedB = await reviewService.getReviewItem(itemB.id);
    expect(refreshedB?.status).toBe('PENDING');
  });

  it('11. rejected proposal leaves files untouched', async () => {
    const rejectFile = path.join(incomingDir, 'RejectTest.mkv');
    fs.writeFileSync(rejectFile, 'rejected content');

    const uniqueTmdbId = 999600 + Math.floor(Math.random() * 1000);
    const rejectMovie = await inventoryRepo.createMovie({
      title: 'Reject Movie',
      year: 2021,
      status: 'MATCHED',
      tmdbId: uniqueTmdbId,
    });
    const ed = await inventoryRepo.createEdition({ movieId: rejectMovie.id });
    const ver = await inventoryRepo.createMediaVersion({ editionId: ed.id });
    await inventoryRepo.createAsset({
      mediaVersionId: ver.id,
      path: rejectFile,
      sizeBytes: 16,
      mtime: new Date(),
    });

    const plan = await planService.createPlan({
      itemId: rejectMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const item = await reviewService.getReviewItemByPlanId(plan.id);
    if (!item) throw new Error('Expected item');
    await reviewService.rejectReviewItem(item.id);

    // Verify rejection leaves file untouched
    expect(fs.existsSync(rejectFile)).toBe(true);
    expect(fs.readFileSync(rejectFile, 'utf8')).toBe('rejected content');

    await prisma.movie.delete({ where: { id: rejectMovie.id } }).catch(() => {});
  });
});
