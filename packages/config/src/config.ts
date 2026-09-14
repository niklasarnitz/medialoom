import { z } from 'zod';

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof logLevelSchema>;

export const configSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required and cannot be empty'),
  TMDB_API_TOKEN: z.string().min(1, 'TMDB_API_TOKEN is required and cannot be empty'),
  FFPROBE_PATH: z.string().min(1).default('ffprobe'),
  LOG_LEVEL: logLevelSchema.default('info'),
});

export type Config = z.infer<typeof configSchema>;

export function parseConfig(raw: unknown): Config {
  return configSchema.parse(raw);
}

export function safeParseConfig(raw: unknown) {
  return configSchema.safeParse(raw);
}

let cachedConfig: Config | null = null;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = configSchema.safeParse({
    DATABASE_URL: env.DATABASE_URL || 'file:./medialoom.db',
    TMDB_API_TOKEN: env.TMDB_API_TOKEN || 'development_token',
    FFPROBE_PATH: env.FFPROBE_PATH,
    LOG_LEVEL: env.LOG_LEVEL,
  });

  if (!result.success) {
    throw new Error(`Configuration validation failed: ${result.error.message}`);
  }

  cachedConfig = result.data;
  return result.data;
}

export function getConfig(): Config {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

export function resetConfigForTesting(): void {
  cachedConfig = null;
}
