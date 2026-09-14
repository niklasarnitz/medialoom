import { getConfig, safeParseConfig } from '@medialoom/config';
import {
  type DoctorCheck,
  type DoctorReportEnvelope,
  type DoctorReportStatus,
  doctorReportEnvelopeSchema,
  type SystemHealth,
  systemHealthSchema,
} from '@medialoom/contracts';
import { checkDatabaseConnection } from '@medialoom/db';

const APP_VERSION = '0.1.0';

export class SystemService {
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

  async getDoctorReport(): Promise<DoctorReportEnvelope> {
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
      if (configResult.success) {
        checks.push({
          name: 'configuration',
          status: 'ok',
          message: 'Configuration is valid',
          details: {
            databaseUrlConfigured: Boolean(config.DATABASE_URL),
            tmdbTokenConfigured: Boolean(config.TMDB_API_TOKEN),
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
