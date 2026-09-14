import { getPrismaClient } from '../client';

export const TMDB_API_KEY_SETTING = 'tmdb_api_key';
export const TMDB_ENV_API_KEY_LAST_SYNCED = 'tmdb_env_api_key_last_synced';

export function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= 8) return '*'.repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export class SettingsRepository {
  private get prisma() {
    return getPrismaClient();
  }

  async getSetting(key: string): Promise<string | null> {
    const record = await this.prisma.systemMetadata.findUnique({
      where: { key },
    });
    return record?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.prisma.systemMetadata.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  async deleteSetting(key: string): Promise<void> {
    await this.prisma.systemMetadata.deleteMany({
      where: { key },
    });
  }

  async getTmdbApiKey(): Promise<string | null> {
    const key = await this.getSetting(TMDB_API_KEY_SETTING);
    return key && key.trim().length > 0 ? key.trim() : null;
  }

  async setTmdbApiKey(key: string): Promise<void> {
    const trimmed = key.trim();
    if (!trimmed) {
      await this.deleteSetting(TMDB_API_KEY_SETTING);
    } else {
      await this.setSetting(TMDB_API_KEY_SETTING, trimmed);
    }
  }

  /**
   * Syncs TMDB API token from the environment only if the env value has changed.
   * This ensures that when the user edits the key via CLI or Web UI,
   * static env values do not overwrite user-configured SQLite values on every boot.
   */
  async syncEnvTmdbApiKey(envKey: string | undefined): Promise<void> {
    if (!envKey || envKey.trim() === '') {
      return;
    }
    const trimmedEnv = envKey.trim();
    const lastSynced = await this.getSetting(TMDB_ENV_API_KEY_LAST_SYNCED);

    if (lastSynced !== trimmedEnv) {
      await this.setSetting(TMDB_API_KEY_SETTING, trimmedEnv);
      await this.setSetting(TMDB_ENV_API_KEY_LAST_SYNCED, trimmedEnv);
    }
  }
}

export const defaultSettingsRepository = new SettingsRepository();
