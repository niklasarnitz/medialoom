import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import {
  closeDatabaseConnection,
  defaultSettingsRepository,
  getPrismaClient,
  maskApiKey,
  SettingsRepository,
} from '../src';

describe('SettingsRepository', () => {
  const repo = new SettingsRepository();
  const prisma = getPrismaClient();

  beforeEach(async () => {
    // Clear system metadata before each test
    await prisma.systemMetadata.deleteMany({});
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  it('stores and retrieves arbitrary key-value settings', async () => {
    await repo.setSetting('custom_key', 'custom_value');
    const val = await repo.getSetting('custom_key');
    expect(val).toBe('custom_value');

    await repo.setSetting('custom_key', 'updated_value');
    const updated = await repo.getSetting('custom_key');
    expect(updated).toBe('updated_value');

    await repo.deleteSetting('custom_key');
    const deleted = await repo.getSetting('custom_key');
    expect(deleted).toBeNull();
  });

  it('sets and gets TMDb API key with trimming', async () => {
    expect(await repo.getTmdbApiKey()).toBeNull();

    await repo.setTmdbApiKey('  valid_tmdb_token_12345  ');
    expect(await repo.getTmdbApiKey()).toBe('valid_tmdb_token_12345');

    // Setting empty or whitespace removes it
    await repo.setTmdbApiKey('   ');
    expect(await repo.getTmdbApiKey()).toBeNull();
  });

  it('syncs from environment when not previously synced', async () => {
    await repo.syncEnvTmdbApiKey('env_token_abc');
    expect(await repo.getTmdbApiKey()).toBe('env_token_abc');
  });

  it('preserves user CLI/WebUI edit when environment key has not changed', async () => {
    // 1. Initial boot syncs env key
    await repo.syncEnvTmdbApiKey('initial_env_token');
    expect(await repo.getTmdbApiKey()).toBe('initial_env_token');

    // 2. User edits key via WebUI or CLI
    await repo.setTmdbApiKey('user_configured_key');
    expect(await repo.getTmdbApiKey()).toBe('user_configured_key');

    // 3. App reboots or runs next command with same env key
    await repo.syncEnvTmdbApiKey('initial_env_token');
    // It should STILL be the user configured key, not overwritten!
    expect(await repo.getTmdbApiKey()).toBe('user_configured_key');

    // 4. If env key actually changes, it syncs the new value
    await repo.syncEnvTmdbApiKey('new_changed_env_token');
    expect(await repo.getTmdbApiKey()).toBe('new_changed_env_token');
  });

  it('masks API keys safely without logging or revealing sensitive portions', () => {
    expect(maskApiKey(null)).toBeNull();
    expect(maskApiKey('')).toBeNull();
    expect(maskApiKey('1234')).toBe('****');
    expect(maskApiKey('12345678')).toBe('********');
    expect(maskApiKey('eyJhbGciOiJIUzI1NiJ9.someSecretPayload.xyz')).toBe('eyJh....xyz');
  });
});
