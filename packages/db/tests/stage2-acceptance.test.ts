import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { AssetType } from '@medialoom/contracts';
import { closeDatabaseConnection, getPrismaClient, InventoryRepository } from '../src';

describe('Stage 2 Acceptance Test (Refined Hierarchy)', () => {
  let repo: InventoryRepository;

  beforeAll(() => {
    repo = new InventoryRepository(getPrismaClient());
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  it('successfully executes the end-to-end inventory lifecycle with refined hierarchy', async () => {
    // 1. Create a Scan
    const scan = await repo.createScan({
      rootPath: '/media/movies',
    });
    expect(scan.id).toBeDefined();
    expect(scan.rootPath).toBe('/media/movies');
    expect(scan.status).toBe('RUNNING');
    expect(scan.completedAt).toBeNull();

    // 2. Create an unmatched Movie
    const movie = await repo.createMovie({
      title: 'Blade Runner 2049',
      year: 2017,
      status: 'UNMATCHED',
    });
    expect(movie.id).toBeDefined();
    expect(movie.status).toBe('UNMATCHED');
    expect(movie.tmdbId).toBeNull();

    // 3. Create Edition and MediaVersion
    const edition = await repo.createEdition({
      movieId: movie.id,
      name: 'Theatrical Cut',
    });
    expect(edition.id).toBeDefined();
    expect(edition.movieId).toBe(movie.id);

    const version = await repo.createMediaVersion({
      editionId: edition.id,
      name: '2160p UHD HDR',
    });
    expect(version.id).toBeDefined();
    expect(version.editionId).toBe(edition.id);

    // 4. Attach a VIDEO Asset (verifying path canonicalization)
    const rawPath = `/media/movies/Blade Runner 2049 (2017)//folder/../Blade Runner 2049-${Date.now()}.mkv`;
    const asset = await repo.createAsset({
      mediaVersionId: version.id,
      type: AssetType.VIDEO,
      path: rawPath,
      sizeBytes: 55_000_000_000,
      mtime: new Date('2026-09-14T08:00:00Z'),
      present: true,
    });
    expect(asset.id).toBeDefined();
    expect(asset.mediaVersionId).toBe(version.id);
    expect(asset.type).toBe('VIDEO');
    expect(asset.sizeBytes).toBe(55_000_000_000);
    expect(asset.path).not.toContain('//');
    expect(asset.path).not.toContain('/../');

    // 5. Attach MediaTechnicalMetadata
    const tech = await repo.setTechnicalMetadata({
      assetId: asset.id,
      container: 'matroska',
      formatName: 'matroska,webm',
      durationSeconds: 9811.2,
      bitRate: 45_000_000,
      width: 3840,
      height: 2160,
      videoCodec: 'hevc',
      audioCodec: 'atmos',
      audioChannels: 8,
    });
    expect(tech.assetId).toBe(asset.id);
    expect(tech.videoCodec).toBe('hevc');
    expect(tech.audioChannels).toBe(8);

    // 6. Retrieve Movie with full hierarchy
    const retrievedMovie = await repo.getMovie(movie.id);
    expect(retrievedMovie).not.toBeNull();
    expect(retrievedMovie?.id).toBe(movie.id);
    expect(retrievedMovie?.status).toBe('UNMATCHED');
    expect(retrievedMovie?.editions).toHaveLength(1);

    const retrievedEdition = retrievedMovie?.editions[0];
    expect(retrievedEdition?.name).toBe('Theatrical Cut');
    expect(retrievedEdition?.mediaVersions).toHaveLength(1);

    const retrievedVersion = retrievedEdition?.mediaVersions[0];
    expect(retrievedVersion?.name).toBe('2160p UHD HDR');
    expect(retrievedVersion?.assets).toHaveLength(1);

    const retrievedAsset = retrievedVersion?.assets[0];
    expect(retrievedAsset?.id).toBe(asset.id);
    expect(retrievedAsset?.type).toBe('VIDEO');
    expect(retrievedAsset?.technicalMetadata?.videoCodec).toBe('hevc');
    expect(retrievedAsset?.technicalMetadata?.audioCodec).toBe('atmos');

    // 7. Complete the Scan
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
