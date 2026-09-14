import { afterAll, describe, expect, it } from 'bun:test';
import { checkDatabaseConnection, closeDatabaseConnection, getPrismaClient } from '../src';

describe('Database Connection', () => {
  afterAll(async () => {
    await closeDatabaseConnection();
  });

  it('connects to SQLite database and verifies connection', async () => {
    const status = await checkDatabaseConnection();
    expect(status.ok).toBe(true);
    expect(status.message).toBe('Database connection successful');
  });

  it('can write and read system metadata', async () => {
    const prisma = getPrismaClient();
    const testKey = `test-key-${Date.now()}`;
    await prisma.systemMetadata.create({
      data: {
        key: testKey,
        value: 'test-value',
      },
    });

    const record = await prisma.systemMetadata.findUnique({
      where: { key: testKey },
    });
    expect(record).not.toBeNull();
    expect(record?.value).toBe('test-value');

    // Clean up
    await prisma.systemMetadata.delete({
      where: { key: testKey },
    });
  });
});
