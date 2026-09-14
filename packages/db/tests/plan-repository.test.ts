import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { defaultInventoryRepository, getPrismaClient, type Movie, PlanRepository } from '../src';

describe('PlanRepository', () => {
  const prisma = getPrismaClient();
  const repo = new PlanRepository(prisma);
  let testMovie: Movie;

  beforeAll(async () => {
    const uniqueTmdbId = 999000 + Math.floor(Math.random() * 1000);
    testMovie = await defaultInventoryRepository.createMovie({
      title: 'The Matrix Test',
      year: 1999,
      status: 'MATCHED',
      tmdbId: uniqueTmdbId,
    });
  });

  afterAll(async () => {
    if (testMovie) {
      await prisma.movie.delete({ where: { id: testMovie.id } }).catch(() => {});
    }
  });

  it('creates and retrieves an OperationPlan', async () => {
    const operations = [
      {
        type: 'mkdir',
        path: '/movies/The Matrix (1999) [tmdbid-603]',
      },
      {
        type: 'move',
        source: '/incoming/The.Matrix.1999.mkv',
        destination: '/movies/The Matrix (1999) [tmdbid-603]/The Matrix (1999) [tmdbid-603].mkv',
      },
    ];

    const plan = await repo.createPlan({
      mediaItemId: testMovie.id,
      profile: 'jellyfin',
      destinationRoot: '/movies',
      operationsJson: JSON.stringify(operations),
    });

    expect(plan.id).toBeDefined();
    expect(plan.mediaItemId).toBe(testMovie.id);
    expect(plan.profile).toBe('jellyfin');
    expect(plan.destinationRoot).toBe('/movies');
    expect(plan.status).toBe('PENDING');

    const fetched = await repo.getPlan(plan.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(plan.id);
    expect(JSON.parse(fetched?.operationsJson ?? '[]')).toEqual(operations);
  });

  it('updates plan status and validation information', async () => {
    const plan = await repo.createPlan({
      mediaItemId: testMovie.id,
      profile: 'jellyfin',
      destinationRoot: '/movies',
      operationsJson: JSON.stringify([]),
    });

    const now = new Date();
    const updated = await repo.updatePlan(plan.id, {
      status: 'VALIDATED',
      validatedAt: now,
      validationJson: JSON.stringify({ valid: true, issues: [] }),
    });

    expect(updated.status).toBe('VALIDATED');
    expect(updated.validatedAt).toBeDefined();
    expect(JSON.parse(updated.validationJson ?? '{}')).toEqual({ valid: true, issues: [] });
  });

  it('lists plans filtered by mediaItemId or status', async () => {
    const plan1 = await repo.createPlan({
      mediaItemId: testMovie.id,
      profile: 'jellyfin',
      destinationRoot: '/movies',
      status: 'PENDING',
      operationsJson: '[]',
    });

    const plan2 = await repo.createPlan({
      mediaItemId: testMovie.id,
      profile: 'jellyfin',
      destinationRoot: '/movies',
      status: 'APPLIED',
      operationsJson: '[]',
    });

    const plansByMovie = await repo.listPlans({ mediaItemId: testMovie.id });
    expect(plansByMovie.length).toBeGreaterThanOrEqual(2);

    const pendingPlans = await repo.listPlans({
      mediaItemId: testMovie.id,
      status: 'PENDING',
    });
    expect(pendingPlans.some((p) => p.id === plan1.id)).toBe(true);
    expect(pendingPlans.some((p) => p.id === plan2.id)).toBe(false);
  });

  it('deletes an OperationPlan', async () => {
    const plan = await repo.createPlan({
      mediaItemId: testMovie.id,
      profile: 'jellyfin',
      destinationRoot: '/movies',
      operationsJson: '[]',
    });

    await repo.deletePlan(plan.id);
    const fetched = await repo.getPlan(plan.id);
    expect(fetched).toBeNull();
  });
});
