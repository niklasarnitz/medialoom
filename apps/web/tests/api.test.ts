import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  apiErrorEnvelopeSchema,
  candidatesApiEnvelopeSchema,
  healthApiEnvelopeSchema,
  inspectApiEnvelopeSchema,
  itemsApiEnvelopeSchema,
  matchApiEnvelopeSchema,
  scanApiEnvelopeSchema,
} from '@medialoom/contracts';
import { defaultInventoryService, defaultSystemService } from '@medialoom/core';
import { defaultInventoryRepository } from '@medialoom/db';
import { TINY_VIDEO_BUFFER } from '@medialoom/media';
import { runCli } from '../../cli/src';
import { Route as HealthRoute } from '../src/routes/api/v1/health';
import { Route as CandidatesRoute } from '../src/routes/api/v1/items/$id/candidates';
import { Route as ItemDetailRoute } from '../src/routes/api/v1/items/$id/index';
import { Route as MatchRoute } from '../src/routes/api/v1/items/$id/match';
import { Route as ItemsRoute } from '../src/routes/api/v1/items/index';
import { Route as ScansRoute } from '../src/routes/api/v1/scans';

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

const mockTmdbSearchPayload = {
  page: 1,
  results: [
    {
      id: 157336,
      title: 'Interstellar',
      release_date: '2014-11-05',
      overview: 'The adventures of a group of explorers...',
      poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    },
  ],
  total_pages: 1,
  total_results: 1,
};

const mockTmdbDetailsPayload = {
  id: 157336,
  title: 'Interstellar',
  release_date: '2014-11-05',
  runtime: 169,
  overview: 'The adventures of a group of explorers...',
  poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
  imdb_id: 'tt0816692',
};

describe('Public HTTP API Routes (/api/v1)', () => {
  it('GET /api/v1/health returns valid system health envelope', async () => {
    const handler = getRouteHandler(HealthRoute, 'GET');
    const request = new Request('http://localhost:3000/api/v1/health');
    const response = await handler({
      request,
      params: {},
      context: {},
      pathname: '/api/v1/health',
      next: async () => new Response(),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    const validated = healthApiEnvelopeSchema.parse(json);

    expect(validated.schemaVersion).toBe(1);
    expect(validated.status).toBe('success');
    expect(validated.data.version).toBe('0.1.0');
    expect(['ok', 'degraded', 'error']).toContain(validated.data.status);
    expect(['connected', 'disconnected']).toContain(validated.data.database);
  });

  it('POST /api/v1/scans validates request body and triggers scan', async () => {
    const handler = getRouteHandler(ScansRoute, 'POST');

    // 1. Invalid payload: missing path -> 400
    const invalidReq = new Request('http://localhost:3000/api/v1/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const invalidRes = await handler({
      request: invalidReq,
      params: {},
      context: {},
      pathname: '/api/v1/scans',
      next: async () => new Response(),
    });
    expect(invalidRes.status).toBe(400);
    const invalidJson = await invalidRes.json();
    const validatedErr = apiErrorEnvelopeSchema.parse(invalidJson);
    expect(validatedErr.status).toBe('error');
    expect(validatedErr.error.code).toBe('INVALID_INPUT');

    // 2. Valid payload: temporary media folder
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'medialoom-api-scan-'));
    try {
      await fs.writeFile(
        path.join(tempDir, 'Inception.2010.1080p.BluRay.x264.mkv'),
        TINY_VIDEO_BUFFER,
      );

      const validReq = new Request('http://localhost:3000/api/v1/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tempDir }),
      });
      const validRes = await handler({
        request: validReq,
        params: {},
        context: {},
        pathname: '/api/v1/scans',
        next: async () => new Response(),
      });
      expect(validRes.status).toBe(201);
      const validJson = await validRes.json();
      const validatedScan = scanApiEnvelopeSchema.parse(validJson);
      expect(validatedScan.schemaVersion).toBe(1);
      expect(validatedScan.data.discovered).toBe(1);
      expect(validatedScan.data.created).toBe(1);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('GET /api/v1/items lists media items with query filtering', async () => {
    const handler = getRouteHandler(ItemsRoute, 'GET');

    const request = new Request('http://localhost:3000/api/v1/items?limit=10');
    const response = await handler({
      request,
      params: {},
      context: {},
      pathname: '/api/v1/items',
      next: async () => new Response(),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    const validated = itemsApiEnvelopeSchema.parse(json);
    expect(validated.schemaVersion).toBe(1);
    expect(validated.status).toBe('success');
    expect(Array.isArray(validated.data.items)).toBe(true);
  });

  it('GET /api/v1/items/:id returns item detail or 404 for missing item', async () => {
    const handler = getRouteHandler(ItemDetailRoute, 'GET');

    // 1. Missing item -> 404
    const missingReq = new Request('http://localhost:3000/api/v1/items/non_existent_id');
    const missingRes = await handler({
      request: missingReq,
      params: { id: 'non_existent_id' },
      context: {},
      pathname: '/api/v1/items/non_existent_id',
      next: async () => new Response(),
    });

    expect(missingRes.status).toBe(404);
    const missingJson = await missingRes.json();
    const validatedMissing = apiErrorEnvelopeSchema.parse(missingJson);
    expect(validatedMissing.status).toBe('error');
    expect(validatedMissing.error.code).toBe('ITEM_NOT_FOUND');

    // 2. Existing item -> 200
    const allItems = await defaultInventoryService.listItems();
    if (allItems.length > 0 && allItems[0]) {
      const existingId = allItems[0].id;
      const existingReq = new Request(`http://localhost:3000/api/v1/items/${existingId}`);
      const existingRes = await handler({
        request: existingReq,
        params: { id: existingId },
        context: {},
        pathname: `/api/v1/items/${existingId}`,
        next: async () => new Response(),
      });

      expect(existingRes.status).toBe(200);
      const existingJson = await existingRes.json();
      const validatedExisting = inspectApiEnvelopeSchema.parse(existingJson);
      expect(validatedExisting.data.item.id).toBe(existingId);
    }
  });

  it('GET /api/v1/items/:id/candidates and POST /api/v1/items/:id/match work correctly with provider', async () => {
    // Configure TMDb key in SQLite
    await defaultSystemService.setTmdbApiKey('test_tmdb_api_key_valid');

    // Mock fetch for TMDb API calls
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/search/movie')) {
        return new Response(JSON.stringify(mockTmdbSearchPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/movie/157336')) {
        return new Response(JSON.stringify(mockTmdbDetailsPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    }) as unknown as typeof fetch;

    try {
      // Create a fixture movie in DB
      const movie = await defaultInventoryRepository.createMovie({
        title: 'Interstellar',
        year: 2014,
        status: 'UNMATCHED',
      });

      // 1. Match candidates route
      const candHandler = getRouteHandler(CandidatesRoute, 'GET');

      const candReq = new Request(`http://localhost:3000/api/v1/items/${movie.id}/candidates`);
      const candRes = await candHandler({
        request: candReq,
        params: { id: movie.id },
        context: {},
        pathname: `/api/v1/items/${movie.id}/candidates`,
        next: async () => new Response(),
      });

      expect(candRes.status).toBe(200);
      const candJson = await candRes.json();
      const validatedCand = candidatesApiEnvelopeSchema.parse(candJson);
      expect(validatedCand.schemaVersion).toBe(1);
      expect(validatedCand.data.itemId).toBe(movie.id);
      expect(validatedCand.data.query).toBe('Interstellar');
      expect(validatedCand.data.year).toBe(2014);
      expect(validatedCand.data.candidates.length).toBe(1);
      expect(validatedCand.data.candidates[0]?.tmdbId).toBe(157336);

      // 2. Match item route (manual match override)
      const matchHandler = getRouteHandler(MatchRoute, 'POST');

      const matchReq = new Request(`http://localhost:3000/api/v1/items/${movie.id}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'tmdb',
          id: '157336', // Interstellar TMDb ID
        }),
      });

      const matchRes = await matchHandler({
        request: matchReq,
        params: { id: movie.id },
        context: {},
        pathname: `/api/v1/items/${movie.id}/match`,
        next: async () => new Response(),
      });

      expect(matchRes.status).toBe(200);
      const matchJson = await matchRes.json();
      const validatedMatch = matchApiEnvelopeSchema.parse(matchJson);
      expect(validatedMatch.data.decision).toBe('AUTO_MATCH');
      expect(validatedMatch.data.matched).toBe(true);
      expect(validatedMatch.data.isManual).toBe(true);
      expect(validatedMatch.data.candidate?.tmdbId).toBe(157336);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('maps provider errors into standard HTTP error status codes', async () => {
    // Configure TMDb key in SQLite
    await defaultSystemService.setTmdbApiKey('test_tmdb_api_key_valid');

    const originalFetch = globalThis.fetch;
    const movie = await defaultInventoryRepository.createMovie({
      title: 'Alien',
      year: 1979,
      status: 'UNMATCHED',
    });

    const candHandler = getRouteHandler(CandidatesRoute, 'GET');

    try {
      // 1. Provider 401 Authentication error -> HTTP 502
      globalThis.fetch = (async () => {
        return new Response(JSON.stringify({ status_message: 'Invalid API key' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as unknown as typeof fetch;

      const authErrRes = await candHandler({
        request: new Request(`http://localhost:3000/api/v1/items/${movie.id}/candidates`),
        params: { id: movie.id },
        context: {},
        pathname: `/api/v1/items/${movie.id}/candidates`,
        next: async () => new Response(),
      });
      expect(authErrRes.status).toBe(502);
      const authErrJson = await authErrRes.json();
      expect(authErrJson.status).toBe('error');
      expect(authErrJson.error.code).toBe('PROVIDER_AUTH_ERROR');

      // 2. Provider 429 Rate Limit error -> HTTP 429
      globalThis.fetch = (async () => {
        return new Response(JSON.stringify({ status_message: 'Rate limit exceeded' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '10' },
        });
      }) as unknown as typeof fetch;

      const rateLimitRes = await candHandler({
        request: new Request(`http://localhost:3000/api/v1/items/${movie.id}/candidates`),
        params: { id: movie.id },
        context: {},
        pathname: `/api/v1/items/${movie.id}/candidates`,
        next: async () => new Response(),
      });
      expect(rateLimitRes.status).toBe(429);
      const rateLimitJson = await rateLimitRes.json();
      expect(rateLimitJson.status).toBe('error');
      expect(rateLimitJson.error.code).toBe('PROVIDER_RATE_LIMIT');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('demonstrates semantic parity between CLI and API adapters', async () => {
    // Both adapters invoke the same services and produce equivalent domain structures
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'medialoom-parity-test-'));
    try {
      await fs.writeFile(path.join(tempDir, 'Gladiator.2000.1080p.BluRay.mkv'), TINY_VIDEO_BUFFER);

      // Scan via CLI
      let cliScanOut = '';
      const cliScanCode = await runCli(['scan', tempDir, '--json'], {
        stdout: { write: (c) => (cliScanOut += c) },
        stderr: { write: () => {} },
      });
      expect(cliScanCode).toBe(0);
      const _cliScan = JSON.parse(cliScanOut);

      // Inspect via CLI
      const items = await defaultInventoryService.listItems();
      const gladiator = items.find((i) => i.title === 'Gladiator');
      expect(gladiator).toBeDefined();

      if (!gladiator) throw new Error('Expected gladiator to be defined');

      let cliInspectOut = '';
      await runCli(['inspect', gladiator.id, '--json'], {
        stdout: { write: (c) => (cliInspectOut += c) },
        stderr: { write: () => {} },
      });
      const cliInspect = JSON.parse(cliInspectOut);

      // Inspect via API
      const apiDetailHandler = getRouteHandler(ItemDetailRoute, 'GET');
      const apiReq = new Request(`http://localhost:3000/api/v1/items/${gladiator.id}`);
      const apiRes = await apiDetailHandler({
        request: apiReq,
        params: { id: gladiator.id },
        context: {},
        pathname: `/api/v1/items/${gladiator.id}`,
        next: async () => new Response(),
      });
      const apiInspect = await apiRes.json();

      // Verify exact semantic payload match
      expect(cliInspect.data.item.id).toBe(apiInspect.data.item.id);
      expect(cliInspect.data.item.title).toBe(apiInspect.data.item.title);
      expect(cliInspect.data.item.year).toBe(apiInspect.data.item.year);
      expect(cliInspect.data.item.status).toBe(apiInspect.data.item.status);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
