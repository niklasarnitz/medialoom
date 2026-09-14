import { getConfig, safeParseConfig } from '@medialoom/config';
import {
  type DoctorCheck,
  type DoctorReportEnvelope,
  type DoctorReportStatus,
  doctorReportEnvelopeSchema,
  type SystemHealth,
  systemHealthSchema,
} from '@medialoom/contracts';
import {
  checkDatabaseConnection,
  defaultSettingsRepository,
  maskApiKey,
  type SettingsRepository,
} from '@medialoom/db';

const APP_VERSION = '0.1.0';

export class SystemService {
  private settingsRepo: SettingsRepository;

  constructor(settingsRepo?: SettingsRepository) {
    this.settingsRepo = settingsRepo ?? defaultSettingsRepository;
  }

  getVersion(): string {
    return APP_VERSION;
  }

  async getHealth(): Promise<SystemHealth> {
    const dbStatus = await checkDatabaseConnection();
    const health: SystemHealth = {
      status: dbStatus.ok ? 'ok' : 'degraded',
      version: this.getVersion(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: dbStatus.ok ? 'connected' : 'disconnected',
    };

    return systemHealthSchema.parse(health);
  }

  async syncEnvConfig(): Promise<void> {
    try {
      const config = getConfig();
      if (config.TMDB_API_TOKEN) {
        await this.settingsRepo.syncEnvTmdbApiKey(config.TMDB_API_TOKEN);
      }
    } catch {
      // Ignore if config fails to parse
    }
  }

  async getTmdbApiKeyMasked(): Promise<{ configured: boolean; maskedKey: string | null }> {
    await this.syncEnvConfig();
    const key = await this.settingsRepo.getTmdbApiKey();
    return {
      configured: Boolean(key),
      maskedKey: maskApiKey(key),
    };
  }

  async setTmdbApiKey(key: string): Promise<void> {
    await this.settingsRepo.setTmdbApiKey(key);
  }

  async getDoctorReport(): Promise<DoctorReportEnvelope> {
    await this.syncEnvConfig();
    const checks: DoctorCheck[] = [];

    // 1. Database Check
    const dbStatus = await checkDatabaseConnection();
    checks.push({
      name: 'database',
      status: dbStatus.ok ? 'ok' : 'error',
      message: dbStatus.message,
    });

    // 2. Config Check
    try {
      const config = getConfig();
      const configResult = safeParseConfig(config);
      const tmdbKey = await this.settingsRepo.getTmdbApiKey();

      if (configResult.success) {
        checks.push({
          name: 'configuration',
          status: 'ok',
          message: 'Configuration is valid',
          details: {
            databaseUrlConfigured: Boolean(config.DATABASE_URL),
            tmdbTokenConfigured: Boolean(tmdbKey),
            ffprobePath: config.FFPROBE_PATH,
            logLevel: config.LOG_LEVEL,
          },
        });
      } else {
        checks.push({
          name: 'configuration',
          status: 'error',
          message: `Configuration errors: ${configResult.error.message}`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      checks.push({
        name: 'configuration',
        status: 'error',
        message: `Failed to load configuration: ${message}`,
      });
    }

    // 3. TMDb Provider Configuration Check
    const tmdbKey = await this.settingsRepo.getTmdbApiKey();
    if (tmdbKey) {
      checks.push({
        name: 'tmdb',
        status: 'ok',
        message: 'TMDb API key is configured',
      });
    } else {
      checks.push({
        name: 'tmdb',
        status: 'warn',
        message: 'TMDb API key is not configured. Metadata lookups will be unavailable.',
      });
    }

    // 3. Runtime Check
    const bunVersion = process.versions.bun;
    checks.push({
      name: 'runtime',
      status: 'ok',
      message: bunVersion ? `Bun v${bunVersion}` : `Node ${process.version}`,
      details: {
        bun: bunVersion ?? null,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    });

    let overallStatus: DoctorReportStatus = 'ok';
    if (checks.some((c) => c.status === 'error')) {
      overallStatus = 'error';
    } else if (checks.some((c) => c.status === 'warn')) {
      overallStatus = 'degraded';
    }

    const envelope: DoctorReportEnvelope = {
      schemaVersion: 1,
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: this.getVersion(),
      checks,
    };

    return doctorReportEnvelopeSchema.parse(envelope);
  }
}

export const defaultSystemService = new SystemService();
