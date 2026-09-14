import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeDatabaseConnection, getPrismaClient, InventoryRepository } from '@medialoom/db';
import { InventoryService } from '../src';

describe('Stage 3 Acceptance Test', () => {
  let repo: InventoryRepository;
  let service: InventoryService;
  let testDir: string;

  beforeAll(() => {
    repo = new InventoryRepository(getPrismaClient());
    service = new InventoryService(repo);
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'medialoom-stage3-acceptance-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('scans The.Matrix fixture and creates an unmatched MediaItem with normalized metadata', async () => {
    const fixtureName = 'The.Matrix.1999.1080p.BluRay.x264-GROUP.mkv';
    const fixturePath = path.join(testDir, fixtureName);
    const fixtureContent = 'fixture binary mock stream data';
    await fs.writeFile(fixturePath, fixtureContent);

    const beforeStat = await fs.stat(fixturePath);

    // 1. Run the scan
    const scanResult = await service.scan(testDir);
    expect(scanResult.discovered).toBe(1);
    expect(scanResult.created).toBe(1);
    expect(scanResult.updated).toBe(0);
    expect(scanResult.failed).toBe(0);

    // 2. Verify media file on disk is unchanged (strict read-only invariant)
    const afterStat = await fs.stat(fixturePath);
    expect(afterStat.size).toBe(beforeStat.size);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
    const content = await fs.readFile(fixturePath, 'utf-8');
    expect(content).toBe(fixtureContent);

    // 3. Locate the created unmatched Movie/MediaItem
    const items = await service.listItems();
    const matrixItem = items.find((i) => i.title === 'The Matrix');
    expect(matrixItem).toBeDefined();

    // Verify unmatched state
    expect(matrixItem?.status).toBe('UNMATCHED');
    expect(matrixItem?.tmdbId).toBeNull();
    expect(matrixItem?.year).toBe(1999);

    // 4. Retrieve item and inspect full hierarchy
    if (!matrixItem) throw new Error('Expected matrixItem to be defined');
    const inspected = await service.getItem(matrixItem.id);
    expect(inspected).not.toBeNull();
    expect(inspected?.editions).toHaveLength(1);

    const edition = inspected?.editions[0];
    expect(edition?.mediaVersions).toHaveLength(1);

    const version = edition?.mediaVersions[0];
    expect(version?.assets).toHaveLength(1);

    const asset = version?.assets[0];
    const canonicalFixturePath = await fs.realpath(fixturePath);
    expect(asset?.path).toBe(canonicalFixturePath);
    expect(asset?.present).toBe(true);
    expect(asset?.sizeBytes).toBe(BigInt(beforeStat.size));

    // Technical metadata must not be present yet (ffprobe is deferred to future stage)
    expect(asset?.technicalMetadata).toBeNull();

    // Normalized filename metadata must match specification
    expect(asset?.filenameMetadata).not.toBeNull();
    const fn = asset?.filenameMetadata;
    if (!fn) throw new Error('Expected filenameMetadata to be defined');
    expect(fn.title).toBe('The Matrix');
    expect(fn.year).toBe(1999);
    expect(fn.screenSize).toBe('1080p');
    expect(fn.source).toBe('Blu-ray');
    expect(fn.releaseGroup).toBe('GROUP');
    expect(fn.videoCodec).toBe('H.264');
    expect(fn.container).toBe('mkv');

    // Verify raw JSON diagnostics retention
    expect(fn.rawJson).toBeDefined();
    const raw = JSON.parse(fn.rawJson ?? '{}');
    expect(raw.screen_size).toBe('1080p');
    expect(raw.release_group).toBe('GROUP');
  });
});
