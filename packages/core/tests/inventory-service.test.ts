import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeDatabaseConnection, getPrismaClient, InventoryRepository } from '@medialoom/db';
import { InventoryService } from '../src';

describe('InventoryService', () => {
  let repo: InventoryRepository;
  let service: InventoryService;
  let testDir: string;

  beforeAll(() => {
    const mockInspector = {
      async inspect() {
        return {
          container: 'matroska',
          formatName: 'matroska',
          durationSeconds: 120,
          bitRate: 5000000,
          sizeBytes: 1000000,
          width: 1920,
          height: 1080,
          videoCodec: 'h264',
          frameRate: 24,
          bitDepth: 8,
          hdrFormat: null,
          audioCodec: 'aac',
          audioChannels: 2,
          audioLanguage: 'English',
          audioLayout: 'stereo',
          videoStreams: [],
          audioStreams: [],
          subtitleStreams: [],
          allStreams: [],
          rawJson: '{}',
        };
      },
    };
    repo = new InventoryRepository(getPrismaClient());
    service = new InventoryService(repo, mockInspector);
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'medialoom-core-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('performs repeated scan with complete idempotency', async () => {
    const movieFile = path.join(testDir, 'Alien (1979).mkv');
    await fs.writeFile(movieFile, 'fake alien video');

    // First scan: discovers and creates 1
    const firstScan = await service.scan(testDir);
    expect(firstScan.discovered).toBe(1);
    expect(firstScan.created).toBe(1);
    expect(firstScan.updated).toBe(0);
    expect(firstScan.failed).toBe(0);

    // Second scan without changes: discovers 1, creates 0, updates 0
    const secondScan = await service.scan(testDir);
    expect(secondScan.discovered).toBe(1);
    expect(secondScan.created).toBe(0);
    expect(secondScan.updated).toBe(0);
    expect(secondScan.failed).toBe(0);

    // Verify exactly one movie exists for this file
    const canonicalPath = await fs.realpath(movieFile);
    const asset = await repo.getAssetByPath(canonicalPath);
    expect(asset).not.toBeNull();
    expect(asset?.present).toBe(true);
  });

  it('detects modified file metadata and updates existing asset', async () => {
    const movieFile = path.join(testDir, 'Blade.Runner.2049.2017.2160p.UHD.BluRay.mkv');
    await fs.writeFile(movieFile, 'initial content');

    const firstScan = await service.scan(testDir);
    expect(firstScan.created).toBe(1);

    // Wait a brief moment and modify the file (content and mtime)
    await new Promise((r) => setTimeout(r, 50));
    await fs.writeFile(movieFile, 'modified longer content that changes size and mtime');

    const secondScan = await service.scan(testDir);
    expect(secondScan.discovered).toBe(1);
    expect(secondScan.created).toBe(0);
    expect(secondScan.updated).toBe(1);

    const canonicalPath = await fs.realpath(movieFile);
    const asset = await repo.getAssetByPath(canonicalPath);
    expect(asset?.sizeBytes).toBeGreaterThan('initial content'.length);
  });

  it('marks missing previously known files as present=false without deleting records', async () => {
    const movieFile1 = path.join(testDir, 'Movie1.1990.1080p.mkv');
    const movieFile2 = path.join(testDir, 'Movie2.1995.1080p.mkv');
    await fs.writeFile(movieFile1, 'movie 1');
    await fs.writeFile(movieFile2, 'movie 2');

    const scan1 = await service.scan(testDir);
    expect(scan1.created).toBe(2);

    const canonical1 = await fs.realpath(movieFile1);
    const canonical2 = await fs.realpath(movieFile2);

    // Remove Movie2 from disk
    await fs.rm(movieFile2);

    const scan2 = await service.scan(testDir);
    expect(scan2.discovered).toBe(1);
    expect(scan2.created).toBe(0);
    expect(scan2.updated).toBe(1); // movieFile2 updated to present=false

    // Verify movieFile1 is still present=true
    const asset1 = await repo.getAssetByPath(canonical1);
    expect(asset1?.present).toBe(true);

    // Verify movieFile2 record is NOT deleted, but present=false
    const asset2 = await repo.getAssetByPath(canonical2);
    expect(asset2).not.toBeNull();
    expect(asset2?.present).toBe(false);

    // Re-create Movie2 on disk
    await fs.writeFile(movieFile2, 'movie 2 restored');
    const scan3 = await service.scan(testDir);
    expect(scan3.discovered).toBe(2);
    expect(scan3.created).toBe(0);
    expect(scan3.updated).toBe(1); // restored to present=true

    const asset2Restored = await repo.getAssetByPath(canonical2);
    expect(asset2Restored?.present).toBe(true);
  });

  it('lists items and inspects item details with full hierarchy', async () => {
    const movieFile = path.join(
      testDir,
      'The.Lord.of.the.Rings.The.Fellowship.of.the.Ring.2001.Extended.1080p.BluRay.mkv',
    );
    await fs.writeFile(movieFile, 'lotr dummy data');

    await service.scan(testDir);

    const items = await service.listItems();
    expect(items.length).toBeGreaterThanOrEqual(1);

    const lotr = items.find((i) => i.title.includes('Fellowship'));
    expect(lotr).toBeDefined();
    if (!lotr) throw new Error('Expected lotr item');

    const inspected = await service.getItem(lotr.id);
    expect(inspected).not.toBeNull();
    expect(inspected?.editions[0]?.name).toBe('Extended');
    expect(inspected?.editions[0]?.mediaVersions[0]?.assets[0]?.filenameMetadata?.source).toBe(
      'Blu-ray',
    );
  });
});
