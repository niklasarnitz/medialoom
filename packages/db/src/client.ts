import { PrismaClient } from '@prisma/client';

let globalPrisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!globalPrisma) {
    globalPrisma = new PrismaClient();
  }
  return globalPrisma;
}

export async function checkDatabaseConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const client = getPrismaClient();
    await client.$queryRawUnsafe('SELECT 1');
    return { ok: true, message: 'Database connection successful' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Database check failed: ${message}` };
  }
}

export async function closeDatabaseConnection(): Promise<void> {
  if (globalPrisma) {
    await globalPrisma.$disconnect();
    globalPrisma = null;
  }
}
