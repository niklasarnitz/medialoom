import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  apiErrorEnvelopeSchema,
  reviewActionApiEnvelopeSchema,
  reviewItemApiEnvelopeSchema,
  reviewListApiEnvelopeSchema,
} from '@medialoom/contracts';
import { defaultPlanService, defaultReviewService } from '@medialoom/core';
import { defaultInventoryRepository, getPrismaClient, type Movie } from '@medialoom/db';

import { Route as ReviewApplyRoute } from '../src/routes/api/v1/review/$id/apply';
import { Route as ReviewApproveRoute } from '../src/routes/api/v1/review/$id/approve';
import { Route as ReviewDetailRoute } from '../src/routes/api/v1/review/$id/index';
import { Route as ReviewRejectRoute } from '../src/routes/api/v1/review/$id/reject';
import { Route as ReviewListRoute } from '../src/routes/api/v1/review/index';

type HttpHandlerFn = (ctx: {
  request: Request;
  params: Record<string, string>;
  context?: unknown;
  pathname?: string;
  next?: () => Promise<Response>;
}) => Promise<Response>;

function getRouteHandler(
  route: { options: { server?: { handlers?: unknown } } },
  method: 'GET' | 'POST',
): HttpHandlerFn {
  const handlers = route.options.server?.handlers;
  if (!handlers || typeof handlers !== 'object' || !(method in handlers)) {
    throw new Error(`Handler for method ${method} is not defined on route.`);
  }
  const handler = (handlers as Record<string, HttpHandlerFn>)[method];
  if (!handler) {
    throw new Error(`Handler for method ${method} is not a function.`);
  }
  return handler;
}

describe('Review HTTP API Routes (/api/v1/review)', () => {
  const prisma = getPrismaClient();
  let tmpDir: string;
  let testMovie: Movie;
  let sampleFile: string;
  let createdPlanId: string;
  let createdReviewId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medialoom-review-api-test-'));
    sampleFile = path.join(tmpDir, 'Arrival.2016.mkv');
    fs.writeFileSync(sampleFile, 'dummy arrival movie content');

    const uniqueTmdbId = 999800 + Math.floor(Math.random() * 1000);
    testMovie = await defaultInventoryRepository.createMovie({
      title: 'Arrival',
      year: 2016,
      status: 'MATCHED',
      tmdbId: uniqueTmdbId,
    });

    const edition = await defaultInventoryRepository.createEdition({ movieId: testMovie.id });
    const version = await defaultInventoryRepository.createMediaVersion({ editionId: edition.id });
    await defaultInventoryRepository.createAsset({
      mediaVersionId: version.id,
      path: sampleFile,
      sizeBytes: 30,
      mtime: new Date(),
    });

    const plan = await defaultPlanService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: path.join(tmpDir, 'movies'),
    });
    createdPlanId = plan.id;

    const reviewItem = await defaultReviewService.getReviewItemByPlanId(createdPlanId);
    if (!reviewItem) throw new Error('Expected review item to be created');
    createdReviewId = reviewItem.id;
  });

  afterAll(async () => {
    if (testMovie) {
      await prisma.movie.delete({ where: { id: testMovie.id } }).catch(() => {});
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('GET /api/v1/review lists review queue items', async () => {
    const handler = getRouteHandler(ReviewListRoute, 'GET');
    const request = new Request('http://localhost:3000/api/v1/review');
    const response = await handler({
      request,
      params: {},
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    const validated = reviewListApiEnvelopeSchema.parse(json);

    expect(validated.status).toBe('success');
    expect(validated.data.items.length).toBeGreaterThanOrEqual(1);
    expect(validated.data.items.some((i) => i.id === createdReviewId)).toBe(true);
  });

  it('GET /api/v1/review/:id retrieves review item details', async () => {
    const handler = getRouteHandler(ReviewDetailRoute, 'GET');
    const request = new Request(`http://localhost:3000/api/v1/review/${createdReviewId}`);
    const response = await handler({
      request,
      params: { id: createdReviewId },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    const validated = reviewItemApiEnvelopeSchema.parse(json);

    expect(validated.status).toBe('success');
    expect(validated.data.item.id).toBe(createdReviewId);
    expect(validated.data.item.status).toBe('PENDING');
    expect(validated.data.item.title).toContain('Arrival');
    expect(validated.data.item.summary).toContain('Arrival');
  });

  it('GET /api/v1/review/:id returns 404 for non-existent item', async () => {
    const handler = getRouteHandler(ReviewDetailRoute, 'GET');
    const request = new Request('http://localhost:3000/api/v1/review/non_existent_id');
    const response = await handler({
      request,
      params: { id: 'non_existent_id' },
    });

    expect(response.status).toBe(404);
    const json = await response.json();
    const validated = apiErrorEnvelopeSchema.parse(json);
    expect(validated.status).toBe('error');
    expect(validated.error.code).toBe('REVIEW_NOT_FOUND');
  });

  it('POST /api/v1/review/:id/apply fails on pending item', async () => {
    const handler = getRouteHandler(ReviewApplyRoute, 'POST');
    const request = new Request(`http://localhost:3000/api/v1/review/${createdReviewId}/apply`, {
      method: 'POST',
    });
    const response = await handler({
      request,
      params: { id: createdReviewId },
    });

    expect(response.status).toBe(422);
    const json = await response.json();
    const validated = apiErrorEnvelopeSchema.parse(json);
    expect(validated.status).toBe('error');
    expect(validated.error.code).toBe('REVIEW_NOT_APPROVED');
  });

  it('POST /api/v1/review/:id/approve approves review item', async () => {
    const handler = getRouteHandler(ReviewApproveRoute, 'POST');
    const request = new Request(`http://localhost:3000/api/v1/review/${createdReviewId}/approve`, {
      method: 'POST',
    });
    const response = await handler({
      request,
      params: { id: createdReviewId },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    const validated = reviewActionApiEnvelopeSchema.parse(json);

    expect(validated.status).toBe('success');
    expect(validated.data.action).toBe('APPROVED');
    expect(validated.data.item.status).toBe('APPROVED');
    expect(validated.data.item.approvedAt).toBeDefined();
  });

  it('POST /api/v1/review/:id/apply succeeds on approved item', async () => {
    const handler = getRouteHandler(ReviewApplyRoute, 'POST');
    const request = new Request(`http://localhost:3000/api/v1/review/${createdReviewId}/apply`, {
      method: 'POST',
    });
    const response = await handler({
      request,
      params: { id: createdReviewId },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe('success');
    expect(json.data.plan.status).toBe('APPLIED');
    expect(json.data.reviewItem.status).toBe('APPLIED');
  });

  it('POST /api/v1/review/:id/reject rejects a review item', async () => {
    // Create another plan to test rejection
    const rejectPlan = await defaultPlanService.createPlan({
      itemId: testMovie.id,
      profile: 'jellyfin',
      destination: path.join(tmpDir, 'movies'),
    });
    const rejectItem = await defaultReviewService.getReviewItemByPlanId(rejectPlan.id);
    if (!rejectItem) throw new Error('Expected review item');

    const handler = getRouteHandler(ReviewRejectRoute, 'POST');
    const request = new Request(`http://localhost:3000/api/v1/review/${rejectItem.id}/reject`, {
      method: 'POST',
    });
    const response = await handler({
      request,
      params: { id: rejectItem.id },
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    const validated = reviewActionApiEnvelopeSchema.parse(json);
    expect(validated.status).toBe('success');
    expect(validated.data.action).toBe('REJECTED');
    expect(validated.data.item.status).toBe('REJECTED');
  });
});
