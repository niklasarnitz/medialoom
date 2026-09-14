import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  defaultInventoryRepository,
  defaultPlanRepository,
  getPrismaClient,
  type Movie,
  type OperationPlan,
  ReviewRepository,
} from '../src';

describe('ReviewRepository', () => {
  const prisma = getPrismaClient();
  const repo = new ReviewRepository(prisma);
  let testMovie: Movie;
  let testPlan: OperationPlan;

  beforeAll(async () => {
    const uniqueTmdbId = 999100 + Math.floor(Math.random() * 1000);
    testMovie = await defaultInventoryRepository.createMovie({
      title: 'Review Repository Movie Test',
      year: 2024,
      status: 'MATCHED',
      tmdbId: uniqueTmdbId,
    });

    testPlan = await defaultPlanRepository.createPlan({
      mediaItemId: testMovie.id,
      profile: 'jellyfin',
      destinationRoot: '/movies',
      operationsJson: '[]',
    });
  });

  afterAll(async () => {
    if (testMovie) {
      await prisma.movie.delete({ where: { id: testMovie.id } }).catch(() => {});
    }
  });

  it('creates and retrieves a ReviewQueueItem', async () => {
    const item = await repo.createReviewItem({
      mediaItemId: testMovie.id,
      operationPlanId: testPlan.id,
      title: 'Reorganize: Review Repository Movie Test (2024)',
      summary: '1 file will be reorganized',
      detailsJson: JSON.stringify({ moves: 1 }),
    });

    expect(item.id).toBeDefined();
    expect(item.type).toBe('FILESYSTEM_CHANGE');
    expect(item.status).toBe('PENDING');
    expect(item.mediaItemId).toBe(testMovie.id);
    expect(item.operationPlanId).toBe(testPlan.id);
    expect(item.title).toBe('Reorganize: Review Repository Movie Test (2024)');
    expect(item.summary).toBe('1 file will be reorganized');

    const fetched = await repo.getReviewItem(item.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(item.id);

    const fetchedByPlan = await repo.getReviewItemByPlanId(testPlan.id);
    expect(fetchedByPlan).not.toBeNull();
    expect(fetchedByPlan?.id).toBe(item.id);
  });

  it('updates review item status and timestamps', async () => {
    const newPlan = await defaultPlanRepository.createPlan({
      mediaItemId: testMovie.id,
      profile: 'jellyfin',
      destinationRoot: '/movies',
      operationsJson: '[]',
    });

    const item = await repo.createReviewItem({
      mediaItemId: testMovie.id,
      operationPlanId: newPlan.id,
      title: 'Test Approval',
      summary: 'Approval test summary',
    });

    const approvedAt = new Date();
    const updated = await repo.updateReviewItem(item.id, {
      status: 'APPROVED',
      approvedAt,
      reviewedAt: approvedAt,
    });

    expect(updated.status).toBe('APPROVED');
    expect(updated.approvedAt).toBeDefined();
    expect(updated.reviewedAt).toBeDefined();
  });

  it('lists review items filtered by status, mediaItemId, or type', async () => {
    const list = await repo.listReviewItems({
      mediaItemId: testMovie.id,
    });
    expect(list.length).toBeGreaterThanOrEqual(2);

    const pendingOnly = await repo.listReviewItems({
      mediaItemId: testMovie.id,
      status: 'PENDING',
    });
    expect(pendingOnly.every((i) => i.status === 'PENDING')).toBe(true);
  });

  it('deletes a review item', async () => {
    const tempPlan = await defaultPlanRepository.createPlan({
      mediaItemId: testMovie.id,
      profile: 'jellyfin',
      destinationRoot: '/movies',
      operationsJson: '[]',
    });

    const item = await repo.createReviewItem({
      mediaItemId: testMovie.id,
      operationPlanId: tempPlan.id,
      title: 'Delete test',
      summary: 'To be deleted',
    });

    await repo.deleteReviewItem(item.id);
    const fetched = await repo.getReviewItem(item.id);
    expect(fetched).toBeNull();
  });
});
