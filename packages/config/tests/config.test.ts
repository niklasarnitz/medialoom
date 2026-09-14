import { describe, expect, it } from 'bun:test';
import { loadConfig, parseConfig, safeParseConfig } from '../src';

describe('Config Validation', () => {
  it('parses valid config and applies defaults for optional fields', () => {
    const parsed = parseConfig({
      DATABASE_URL: 'file:./test.db',
      TMDB_API_TOKEN: 'valid_token_123',
    });

    expect(parsed.DATABASE_URL).toBe('file:./test.db');
    expect(parsed.TMDB_API_TOKEN).toBe('valid_token_123');
    expect(parsed.FFPROBE_PATH).toBe('ffprobe');
    expect(parsed.LOG_LEVEL).toBe('info');
  });

  it('respects explicitly provided optional fields', () => {
    const parsed = parseConfig({
      DATABASE_URL: 'file:./test.db',
      TMDB_API_TOKEN: 'valid_token_123',
      FFPROBE_PATH: '/opt/bin/ffprobe',
      LOG_LEVEL: 'debug',
    });

    expect(parsed.FFPROBE_PATH).toBe('/opt/bin/ffprobe');
    expect(parsed.LOG_LEVEL).toBe('debug');
  });

  it('fails when DATABASE_URL is missing', () => {
    const result = safeParseConfig({
      TMDB_API_TOKEN: 'valid_token_123',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('DATABASE_URL'))).toBe(true);
    }
  });

  it('allows TMDB_API_TOKEN to be omitted from env', () => {
    const result = safeParseConfig({
      DATABASE_URL: 'file:./test.db',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TMDB_API_TOKEN).toBeUndefined();
    }
  });

  it('fails when LOG_LEVEL is not a valid enum value', () => {
    const result = safeParseConfig({
      DATABASE_URL: 'file:./test.db',
      TMDB_API_TOKEN: 'token',
      LOG_LEVEL: 'super-verbose',
    });

    expect(result.success).toBe(false);
  });

  it('loadConfig provides fallback for local execution when env variables are empty', () => {
    const config = loadConfig({});
    expect(config.DATABASE_URL).toBe('file:./medialoom.db');
    expect(config.TMDB_API_TOKEN).toBeUndefined();
    expect(config.FFPROBE_PATH).toBe('ffprobe');
    expect(config.LOG_LEVEL).toBe('info');
  });
});
