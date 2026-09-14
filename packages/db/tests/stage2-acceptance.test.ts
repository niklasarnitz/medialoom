import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { AssetType } from '@medialoom/contracts';
import { closeDatabaseConnection, getPrismaClient, InventoryRepository } from '../src';

describe('Stage 2 Acceptance Test', () => {
  let repo: InventoryRepository;

  beforeAll(() => {
    repo = new InventoryRepository(getPrismaClient());
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  it('successfully executes the Stage 2 end-to-end inventory lifecycle', async () => {
    // 1. Create a Scan
    const scan = await repo.createScan({
      rootPath: '/media/movies',
    });
    expect(scan.id).toBeDefined();
    expect(scan.rootPath).toBe('/media/movies');
    expect(scan.status).toBe('RUNNING');
    expect(scan.completedAt).toBeNull();

    // 2. Create an unmatched MediaItem
    const mediaItem = await repo.createMediaItem({
      status: 'UNMATCHED',
    });
    expect(mediaItem.id).toBeDefined();
    expect(mediaItem.movieId).toBeNull();
    expect(mediaItem.status).toBe('UNMATCHED');

    // 3. Attach a VIDEO Asset
    const testPath = `/media/movies/Acceptance Test (2026)/Acceptance Test-${Date.now()}.mkv`;
    const asset = await repo.createAsset({
      mediaItemId: mediaItem.id,
      type: AssetType.VIDEO,
      path: testPath,
      sizeBytes: 10_737_418_240, // 10 GiB
      mtime: new Date('2026-09-14T08:00:00Z'),
      present: true,
    });
    expect(asset.id).toBeDefined();
    expect(asset.mediaItemId).toBe(mediaItem.id);
    expect(asset.type).toBe('VIDEO');
    expect(asset.sizeBytes).toBe(10_737_418_240);

    // 4. Retrieve it
    const retrievedMediaItem = await repo.getMediaItem(mediaItem.id);
    expect(retrievedMediaItem).not.toBeNull();
    expect(retrievedMediaItem?.id).toBe(mediaItem.id);
    expect(retrievedMediaItem?.movieId).toBeNull();
    expect(retrievedMediaItem?.status).toBe('UNMATCHED');
    expect(retrievedMediaItem?.assets).toHaveLength(1);

    const attachedAsset = retrievedMediaItem?.assets[0];
    expect(attachedAsset?.id).toBe(asset.id);
    expect(attachedAsset?.path).toBe(testPath);
    expect(attachedAsset?.type).toBe('VIDEO');
    expect(attachedAsset?.sizeBytes).toBe(10_737_418_240);

    // 5. Complete the Scan
    const completedScan = await repo.completeScan(scan.id, {
      discoveredCount: 1,
      createdCount: 1,
      updatedCount: 0,
      failedCount: 0,
    });
    expect(completedScan.id).toBe(scan.id);
    expect(completedScan.status).toBe('COMPLETED');
    expect(completedScan.completedAt).not.toBeNull();
    expect(completedScan.discoveredCount).toBe(1);
    expect(completedScan.createdCount).toBe(1);
    expect(completedScan.failedCount).toBe(0);
  });
});
