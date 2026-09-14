import { describe, expect, it } from 'bun:test';
import { systemHealthSchema } from '@medialoom/contracts';
import {
  fetchPageData,
  fetchSystemHealth,
  getSystemHealthData,
  getTmdbSettingsData,
  Route,
  saveTmdbApiKey,
} from '../src/routes/index';

describe('Web Server Health & Loader', () => {
  it('fetchSystemHealth and fetchPageData server functions are properly defined', () => {
    expect(typeof fetchSystemHealth).toBe('function');
    expect(fetchSystemHealth.method).toBe('GET');
    expect(typeof fetchPageData).toBe('function');
    expect(fetchPageData.method).toBe('GET');
  });

  it('saveTmdbApiKey server function is properly defined', () => {
    expect(typeof saveTmdbApiKey).toBe('function');
    expect(saveTmdbApiKey.method).toBe('POST');
  });

  it('getSystemHealthData returns valid system health conforming to schema', async () => {
    const health = await getSystemHealthData();
    expect(health).toBeDefined();

    const validated = systemHealthSchema.parse(health);
    expect(validated.version).toBe('0.1.0');
    expect(['ok', 'degraded', 'error']).toContain(validated.status);
    expect(['connected', 'disconnected']).toContain(validated.database);
    expect(typeof validated.uptime).toBe('number');
    expect(typeof validated.timestamp).toBe('string');
  });

  it('getTmdbSettingsData returns masked TMDb settings data', async () => {
    const tmdb = await getTmdbSettingsData();
    expect(tmdb).toBeDefined();
    expect(typeof tmdb.configured).toBe('boolean');
    if (tmdb.configured) {
      expect(typeof tmdb.maskedKey).toBe('string');
    }
  });

  it('route is configured with loader and component', () => {
    expect(Route.options.loader).toBeDefined();
    expect(typeof Route.options.loader).toBe('function');
    expect(Route.options.component).toBeDefined();
  });
});
