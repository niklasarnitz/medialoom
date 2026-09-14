import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  defaultInventoryRepository,
  defaultPlanRepository,
  defaultReviewRepository,
  getPrismaClient,
} from '@medialoom/db';
import {
  ConflictError,
  PlanExecutor,
  PlanService,
  ReviewNotApprovedError,
  ReviewService,
} from '../src';

describe('Stage 12: Safe PlanExecutor & ReviewQueue Execution', () => {
  const prisma = getPrismaClient();
  const inventoryRepo = defaultInventoryRepository;
  const planRepo = defaultPlanRepository;
  const reviewRepo = defaultReviewRepository;

  const planExecutor = new PlanExecutor({ planRepo, reviewRepo, inventoryRepo });
  const reviewService = new ReviewService({ reviewRepo, planRepo, inventoryRepo, planExecutor });
  const planService = new PlanService({ inventoryRepo, planRepo, reviewService });

  let tmpDir: string;
  let incomingDir: string;
  let targetDir: string;
  const createdMovieIds: string[] = [];

  const createTestMovie = async (titlePrefix = 'Inception') => {
    const uniqueTmdbId = 999900 + Math.floor(Math.random() * 100000);
    const movie = await inventoryRepo.createMovie({
      title: `${titlePrefix} ${uniqueTmdbId}`,
      year: 2010,
      status: 'MATCHED',
      tmdbId: uniqueTmdbId,
    });
    createdMovieIds.push(movie.id);
    return movie;
  };

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medialoom-executor-stage12-'));
    incomingDir = path.join(tmpDir, 'incoming');
    targetDir = path.join(tmpDir, 'movies');
    fs.mkdirSync(incomingDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
  });

  afterAll(async () => {
    for (const id of createdMovieIds) {
      await prisma.movie.delete({ where: { id } }).catch(() => {});
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('refuses to apply a PENDING review item', async () => {
    const testMovie = await createTestMovie('Pending');
    const file = path.join(incomingDir, 'Inception.2010.mkv');
    fs.writeFileSync(file, 'inception movie data');

    const ed = await inventoryRepo.createEdition({ movieId: testMovie.id });
    const ver = await inventoryRepo.createMediaVersion({ editionId: ed.id });
    await inventoryRepo.createAsset({
      mediaVersionId: ver.id,
      path: file,
      sizeBytes: 20,
      mtime: new Date(),
    });

    const plan = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const review = await reviewService.getReviewItemByPlanId(plan.id);
    expect(review?.status).toBe('PENDING');
    if (!review) throw new Error('Expected review item');

    await expect(planExecutor.applyApprovedReviewItem(review.id)).rejects.toThrow(
      ReviewNotApprovedError,
    );

    // Source file must remain intact
    expect(fs.existsSync(file)).toBe(true);
  });

  it('refuses to apply a REJECTED review item', async () => {
    const testMovie = await createTestMovie('Rejected');
    const file = path.join(incomingDir, 'Inception.Rejected.mkv');
    fs.writeFileSync(file, 'inception rejected data');

    const ed = await inventoryRepo.createEdition({ movieId: testMovie.id });
    const ver = await inventoryRepo.createMediaVersion({ editionId: ed.id });
    await inventoryRepo.createAsset({
      mediaVersionId: ver.id,
      path: file,
      sizeBytes: 23,
      mtime: new Date(),
    });

    const plan = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const review = await reviewService.getReviewItemByPlanId(plan.id);
    if (!review) throw new Error('Expected review item');

    await reviewService.rejectReviewItem(review.id);
    const rejected = await reviewService.getReviewItem(review.id);
    expect(rejected?.status).toBe('REJECTED');

    await expect(planExecutor.applyApprovedReviewItem(review.id)).rejects.toThrow(
      ReviewNotApprovedError,
    );

    // Source file must remain intact
    expect(fs.existsSync(file)).toBe(true);
  });

  it('allows dry-run against PENDING item without mutating files or database state', async () => {
    const testMovie = await createTestMovie('DryRun');
    const file = path.join(incomingDir, 'Inception.DryRun.mkv');
    fs.writeFileSync(file, 'inception dry-run data');

    const ed = await inventoryRepo.createEdition({ movieId: testMovie.id });
    const ver = await inventoryRepo.createMediaVersion({ editionId: ed.id });
    await inventoryRepo.createAsset({
      mediaVersionId: ver.id,
      path: file,
      sizeBytes: 22,
      mtime: new Date(),
    });

    const plan = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const review = await reviewService.getReviewItemByPlanId(plan.id);
    if (!review) throw new Error('Expected review item');
    expect(review.status).toBe('PENDING');

    const result = await planExecutor.applyApprovedReviewItem(review.id, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.executedOperations).toBeGreaterThan(0);
    expect(result.operationResults.every((r) => r.status === 'succeeded')).toBe(true);

    // Verify Review item is STILL PENDING and plan is STILL VALIDATED/PENDING
    const fetchedReview = await reviewService.getReviewItem(review.id);
    expect(fetchedReview?.status).toBe('PENDING');

    // Verify source file was NOT moved
    expect(fs.existsSync(file)).toBe(true);
  });

  it('safely executes an APPROVED review item, updates asset path, and records per-operation states', async () => {
    const testMovie = await createTestMovie('ApproveExecute');
    const file = path.join(incomingDir, 'Inception.ApproveExecute.mkv');
    fs.writeFileSync(file, 'inception approve execute data');

    const ed = await inventoryRepo.createEdition({ movieId: testMovie.id });
    const ver = await inventoryRepo.createMediaVersion({ editionId: ed.id });
    const asset = await inventoryRepo.createAsset({
      mediaVersionId: ver.id,
      path: file,
      sizeBytes: 30,
      mtime: new Date(),
    });

    const plan = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const review = await reviewService.getReviewItemByPlanId(plan.id);
    if (!review) throw new Error('Expected review item');

    await reviewService.approveReviewItem(review.id);

    const result = await planExecutor.applyApprovedReviewItem(review.id);
    expect(result.dryRun).toBe(false);
    expect(result.plan.status).toBe('APPLIED');
    expect(result.reviewItem.status).toBe('APPLIED');
    expect(result.executedOperations).toBe(result.operationResults.length);
    expect(result.operationResults.every((r) => r.status === 'succeeded')).toBe(true);

    // Old source file was moved
    expect(fs.existsSync(file)).toBe(false);

    // Asset path in DB was updated to new destination path
    const updatedAsset = await inventoryRepo.getAsset(asset.id);
    expect(updatedAsset?.path).not.toBe(file);
    expect(updatedAsset?.path ? fs.existsSync(updatedAsset.path) : false).toBe(true);
  });

  it('aborts real apply if source file was deleted between approval and execution (filesystem changed)', async () => {
    const testMovie = await createTestMovie('DeletedLater');
    const file = path.join(incomingDir, 'Inception.DeletedLater.mkv');
    fs.writeFileSync(file, 'will be deleted before apply');

    const ed = await inventoryRepo.createEdition({ movieId: testMovie.id });
    const ver = await inventoryRepo.createMediaVersion({ editionId: ed.id });
    await inventoryRepo.createAsset({
      mediaVersionId: ver.id,
      path: file,
      sizeBytes: 28,
      mtime: new Date(),
    });

    const plan = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const review = await reviewService.getReviewItemByPlanId(plan.id);
    if (!review) throw new Error('Expected review item');

    await reviewService.approveReviewItem(review.id);

    // Now delete source file to simulate filesystem change!
    fs.unlinkSync(file);

    await expect(planExecutor.applyApprovedReviewItem(review.id)).rejects.toThrow(ConflictError);

    // Review item and plan are marked FAILED
    const failedReview = await reviewService.getReviewItem(review.id);
    expect(failedReview?.status).toBe('FAILED');
    const failedPlan = await planRepo.getPlan(plan.id);
    expect(failedPlan?.status).toBe('FAILED');
    expect(failedPlan?.failureReason).toContain('SOURCE_NOT_FOUND');
  });

  it('aborts real apply if a conflicting file was created at destination before execution', async () => {
    const testMovie = await createTestMovie('CollisionTest');
    const file = path.join(incomingDir, 'Inception.CollisionTest.mkv');
    fs.writeFileSync(file, 'collision source movie');

    const ed = await inventoryRepo.createEdition({ movieId: testMovie.id });
    const ver = await inventoryRepo.createMediaVersion({ editionId: ed.id });
    await inventoryRepo.createAsset({
      mediaVersionId: ver.id,
      path: file,
      sizeBytes: 22,
      mtime: new Date(),
    });

    const plan = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const review = await reviewService.getReviewItemByPlanId(plan.id);
    if (!review) throw new Error('Expected review item');

    await reviewService.approveReviewItem(review.id);

    // Intentionally create a file at destination target to trigger DESTINATION_COLLISION
    const moveOp = plan.operations.find((op) => op.type === 'move');
    if (moveOp?.type !== 'move') throw new Error('Expected move operation');

    fs.mkdirSync(path.dirname(moveOp.destination), { recursive: true });
    fs.writeFileSync(moveOp.destination, 'conflicting file already here');

    // Refuses execution to prevent silent overwrite!
    await expect(planExecutor.applyApprovedReviewItem(review.id)).rejects.toThrow(ConflictError);

    // Destination file is untouched
    expect(fs.readFileSync(moveOp.destination, 'utf8')).toBe('conflicting file already here');
    // Source file is preserved
    expect(fs.existsSync(file)).toBe(true);

    // Clean up collision file
    fs.unlinkSync(moveOp.destination);
  });

  it('refuses duplicate apply attempt on an already APPLIED plan', async () => {
    const testMovie = await createTestMovie('DuplicateApply');
    const file = path.join(incomingDir, 'Inception.DuplicateApply.mkv');
    fs.writeFileSync(file, 'duplicate apply data');

    const ed = await inventoryRepo.createEdition({ movieId: testMovie.id });
    const ver = await inventoryRepo.createMediaVersion({ editionId: ed.id });
    await inventoryRepo.createAsset({
      mediaVersionId: ver.id,
      path: file,
      sizeBytes: 20,
      mtime: new Date(),
    });

    const plan = await planService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: targetDir,
    });

    const review = await reviewService.getReviewItemByPlanId(plan.id);
    if (!review) throw new Error('Expected review item');

    await reviewService.approveReviewItem(review.id);
    await planExecutor.applyApprovedReviewItem(review.id);

    // Second apply attempt must be rejected
    await expect(planExecutor.applyApprovedReviewItem(review.id)).rejects.toThrow(ConflictError);
  });
});
