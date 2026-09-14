import { describe, expect, it } from 'bun:test';
import { defaultSystemService } from '../src';

describe('SystemService', () => {
  it('returns valid semantic version', () => {
    const version = defaultSystemService.getVersion();
    expect(version).toBe('0.1.0');
  });

  it('returns valid SystemHealth schema', async () => {
    const health = await defaultSystemService.getHealth();
    expect(health.version).toBe('0.1.0');
    expect(['ok', 'degraded', 'error']).toContain(health.status);
    expect(typeof health.uptime).toBe('number');
    expect(typeof health.timestamp).toBe('string');
    expect(['connected', 'disconnected']).toContain(health.database);
  });

  it('returns valid DoctorReportEnvelope adhering to schema version 1', async () => {
    const report = await defaultSystemService.getDoctorReport();
    expect(report.schemaVersion).toBe(1);
    expect(['ok', 'degraded', 'error']).toContain(report.status);
    expect(report.version).toBe('0.1.0');
    expect(Array.isArray(report.checks)).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(3);

    const dbCheck = report.checks.find((c) => c.name === 'database');
    expect(dbCheck).toBeDefined();

    const configCheck = report.checks.find((c) => c.name === 'configuration');
    expect(configCheck).toBeDefined();

    const runtimeCheck = report.checks.find((c) => c.name === 'runtime');
    expect(runtimeCheck).toBeDefined();
  });
});
