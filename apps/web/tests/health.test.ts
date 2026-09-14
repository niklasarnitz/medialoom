import { describe, expect, it } from 'bun:test';
import { systemHealthSchema } from '@medialoom/contracts';
import { fetchSystemHealth, getSystemHealthData, Route } from '../src/routes/index';

describe('Web Server Health & Loader', () => {
  it('fetchSystemHealth server function is properly defined', () => {
    expect(typeof fetchSystemHealth).toBe('function');
    expect(fetchSystemHealth.method).toBe('GET');
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

  it('route is configured with loader and component', () => {
    expect(Route.options.loader).toBeDefined();
    expect(typeof Route.options.loader).toBe('function');
    expect(Route.options.component).toBeDefined();
  });
});
