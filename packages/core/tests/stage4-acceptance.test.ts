import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { closeDatabaseConnection, getPrismaClient, InventoryRepository } from '@medialoom/db';
import {
  FfprobeExecutionError,
  FfprobeInvalidMediaError,
  FfprobeParseError,
  type NormalizedTechnicalMetadata,
} from '@medialoom/media';
import { InventoryService, type MediaInspector } from '../src';

class SpyInspector implements MediaInspector {
  public callCount = 0;
  public inspectedPaths: string[] = [];
  private handler: (filePath: string) => Promise<NormalizedTechnicalMetadata>;

  constructor(handler: (filePath: string) => Promise<NormalizedTechnicalMetadata>) {
    this.handler = handler;
  }

  async inspect(filePath: string): Promise<NormalizedTechnicalMetadata> {
    this.callCount++;
    this.inspectedPaths.push(filePath);
    return this.handler(filePath);
  }
}

describe('Stage 4 Acceptance Test: ffprobe Technical Inspection', () => {
  let repo: InventoryRepository;
  let testDir: string;

  beforeAll(() => {
    repo = new InventoryRepository(getPrismaClient());
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'medialoom-stage4-acceptance-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('scans a valid fixture, persists normalized technical metadata, and keeps media files unmodified', async () => {
    const fixtureName = 'Inception.2010.1080p.BluRay.x264.mkv';
    const fixturePath = path.join(testDir, fixtureName);
    const fixtureBytes = 'mock video binary data buffer';
    await fs.writeFile(fixturePath, fixtureBytes);
    const beforeStat = await fs.stat(fixturePath);

    const mockTechnical: NormalizedTechnicalMetadata = {
      container: 'matroska',
      formatName: 'matroska,webm',
      durationSeconds: 8880.25,
      bitRate: 12000000,
      sizeBytes: 15000000000,
      width: 1920,
      height: 1080,
      videoCodec: 'h264',
      frameRate: 23.976,
      bitDepth: 8,
      hdrFormat: null,
      audioCodec: 'dts',
      audioChannels: 6,
      audioLanguage: 'English',
      audioLayout: '5.1',
      videoStreams: [
        {
          index: 0,
          codec: 'h264',
          codecLongName: 'H.264 / AVC',
          profile: 'High',
          width: 1920,
          height: 1080,
          frameRate: 23.976,
          bitDepth: 8,
          hdrFormat: null,
          bitRate: 10500000,
        },
      ],
      audioStreams: [
        {
          index: 1,
          codec: 'dts',
          codecLongName: 'DTS-HD Master Audio',
          profile: 'DTS-HD MA',
          channels: 6,
          channelLayout: '5.1',
          sampleRate: 48000,
          bitRate: 1500000,
          language: 'English',
          title: 'Surround 5.1',
          isDefault: true,
        },
      ],
      subtitleStreams: [
        {
          index: 2,
          codec: 'subrip',
          codecLongName: 'SubRip',
          language: 'English',
          title: 'English SDH',
          isDefault: false,
          isForced: true,
        },
      ],
      allStreams: [
        {
          index: 0,
          streamType: 'VIDEO',
          codec: 'h264',
          codecLongName: 'H.264 / AVC',
          profile: 'High',
          width: 1920,
          height: 1080,
          frameRate: 23.976,
          bitDepth: 8,
          hdrFormat: null,
          bitRate: 10500000,
        },
        {
          index: 1,
          streamType: 'AUDIO',
          codec: 'dts',
          codecLongName: 'DTS-HD Master Audio',
          profile: 'DTS-HD MA',
          channels: 6,
          channelLayout: '5.1',
          sampleRate: 48000,
          bitRate: 1500000,
          language: 'English',
          title: 'Surround 5.1',
          isDefault: true,
        },
        {
          index: 2,
          streamType: 'SUBTITLE',
          codec: 'subrip',
          codecLongName: 'SubRip',
          profile: null,
          language: 'English',
          title: 'English SDH',
          isDefault: false,
          isForced: true,
        },
      ],
      rawJson: JSON.stringify({ mock: 'raw_ffprobe_json' }),
    };

    const inspector = new SpyInspector(async () => mockTechnical);
    const service = new InventoryService(repo, inspector);

    // 1. Scan directory
    const scanResult = await service.scan(testDir);
    expect(scanResult.discovered).toBe(1);
    expect(scanResult.created).toBe(1);
    expect(scanResult.updated).toBe(0);
    expect(scanResult.failed).toBe(0);

    // 2. Strict read-only invariant on disk
    const afterStat = await fs.stat(fixturePath);
    expect(afterStat.size).toBe(beforeStat.size);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);

    // 3. Inspect MediaItem
    const items = await service.listItems();
    const movie = items.find((i) => i.title.includes('Inception'));
    expect(movie).toBeDefined();
    if (!movie) throw new Error('Expected movie');

    const inspected = await service.getItem(movie.id);
    expect(inspected).not.toBeNull();

    const asset = inspected?.editions[0]?.mediaVersions[0]?.assets[0];
    expect(asset).toBeDefined();

    // Verify filename metadata
    expect(asset?.filenameMetadata).not.toBeNull();
    expect(asset?.filenameMetadata?.title).toBe('Inception');
    expect(asset?.filenameMetadata?.year).toBe(2010);
    expect(asset?.filenameMetadata?.screenSize).toBe('1080p');

    // Verify technical metadata
    expect(asset?.technicalMetadata).not.toBeNull();
    const tech = asset?.technicalMetadata;
    expect(tech?.container).toBe('matroska');
    expect(tech?.durationSeconds).toBe(8880.25);
    expect(tech?.width).toBe(1920);
    expect(tech?.height).toBe(1080);
    expect(tech?.videoCodec).toBe('h264');
    expect(tech?.frameRate).toBe(23.976);
    expect(tech?.bitDepth).toBe(8);
    expect(tech?.audioCodec).toBe('dts');
    expect(tech?.audioChannels).toBe(6);
    expect(tech?.audioLanguage).toBe('English');

    // Verify streams are queryable and normalized
    expect(tech?.streams).toHaveLength(3);
    const videoStream = tech?.streams.find((s) => s.streamType === 'VIDEO');
    expect(videoStream?.codec).toBe('h264');
    expect(videoStream?.width).toBe(1920);
    expect(videoStream?.height).toBe(1080);

    const audioStream = tech?.streams.find((s) => s.streamType === 'AUDIO');
    expect(audioStream?.codec).toBe('dts');
    expect(audioStream?.channels).toBe(6);
    expect(audioStream?.isDefault).toBe(true);

    const subStream = tech?.streams.find((s) => s.streamType === 'SUBTITLE');
    expect(subStream?.codec).toBe('subrip');
    expect(subStream?.isForced).toBe(true);
  });

  it('preserves both GuessIt claims and ffprobe measurements when they disagree', async () => {
    // Filename claims 4K HEVC:
    const fixtureName = 'Movie.2160p.UHD.x265.mkv';
    const fixturePath = path.join(testDir, fixtureName);
    await fs.writeFile(fixturePath, 'mock movie binary');

    // ffprobe measures actual 1080p H.264:
    const mockDisagreement: NormalizedTechnicalMetadata = {
      container: 'matroska',
      formatName: 'matroska',
      durationSeconds: 5400,
      bitRate: 8000000,
      sizeBytes: 5000000000,
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
      videoStreams: [
        {
          index: 0,
          codec: 'h264',
          codecLongName: 'H.264',
          profile: 'High',
          width: 1920,
          height: 1080,
          frameRate: 24,
          bitDepth: 8,
          hdrFormat: null,
          bitRate: 7500000,
        },
      ],
      audioStreams: [],
      subtitleStreams: [],
      allStreams: [
        {
          index: 0,
          streamType: 'VIDEO',
          codec: 'h264',
          codecLongName: 'H.264',
          profile: 'High',
          width: 1920,
          height: 1080,
          frameRate: 24,
          bitDepth: 8,
          hdrFormat: null,
          bitRate: 7500000,
        },
      ],
      rawJson: '{}',
    };

    const service = new InventoryService(repo, new SpyInspector(async () => mockDisagreement));
    await service.scan(testDir);

    const items = await service.listItems();
    const movie = items.find((i) => i.title.includes('Movie'));
    expect(movie).toBeDefined();
    if (!movie) throw new Error('Expected movie');

    const inspected = await service.getItem(movie.id);
    const asset = inspected?.editions[0]?.mediaVersions[0]?.assets[0];

    // Filename metadata claims 2160p and H.265
    expect(asset?.filenameMetadata?.screenSize).toBe('2160p');
    expect(asset?.filenameMetadata?.videoCodec).toBe('H.265');

    // Actual technical metadata measures 1080p and H.264
    expect(asset?.technicalMetadata?.width).toBe(1920);
    expect(asset?.technicalMetadata?.height).toBe(1080);
    expect(asset?.technicalMetadata?.videoCodec).toBe('h264');

    // Never replace measured properties with filename claims, or vice versa
    expect(asset?.technicalMetadata?.width).not.toBe(3840);
    expect(asset?.filenameMetadata?.videoCodec).not.toBe('h264');
  });

  it('handles corrupt asset among valid assets without aborting the scan', async () => {
    const validFile = path.join(testDir, 'ValidMovie.1080p.mkv');
    const corruptFile = path.join(testDir, 'CorruptMovie.1080p.mkv');
    await fs.writeFile(validFile, 'valid');
    await fs.writeFile(corruptFile, 'corrupt');

    const validTechnical: NormalizedTechnicalMetadata = {
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

    const inspector = new SpyInspector(async (fp) => {
      if (fp.includes('Corrupt')) {
        throw new FfprobeInvalidMediaError('Media stream is damaged or truncated');
      }
      return validTechnical;
    });

    const service = new InventoryService(repo, inspector);
    const result = await service.scan(testDir);

    expect(result.discovered).toBe(2);
    expect(result.created).toBe(2); // both assets registered in inventory
    expect(result.failed).toBe(1); // corrupt file failed technical inspection

    // Verify valid movie has technical metadata
    const canonicalValid = await fs.realpath(validFile);
    const validAsset = await repo.getAssetByPath(canonicalValid);
    expect(validAsset?.technicalMetadata).not.toBeNull();
    expect(validAsset?.technicalMetadata?.width).toBe(1920);

    // Verify corrupt movie was not lost, but lacks technical metadata
    const canonicalCorrupt = await fs.realpath(corruptFile);
    const corruptAsset = await repo.getAssetByPath(canonicalCorrupt);
    expect(corruptAsset).not.toBeNull();
    expect(corruptAsset?.technicalMetadata).toBeNull();
    expect(corruptAsset?.filenameMetadata).not.toBeNull();
  });

  it('handles process failure and malformed JSON errors gracefully per-file', async () => {
    const errorFile = path.join(testDir, 'Problematic.1080p.mkv');
    await fs.writeFile(errorFile, 'data');

    // 1. Process failure
    const execFailInspector = new SpyInspector(async () => {
      throw new FfprobeExecutionError('ffprobe returned non-zero code', 1, 'Decoder error');
    });
    const service1 = new InventoryService(repo, execFailInspector);
    const result1 = await service1.scan(testDir);
    expect(result1.failed).toBe(1);

    // 2. Malformed JSON
    const parseFailInspector = new SpyInspector(async () => {
      throw new FfprobeParseError('Unrecognized token');
    });
    const service2 = new InventoryService(repo, parseFailInspector);
    const result2 = await service2.scan(testDir);
    expect(result2.failed).toBe(1);
  });

  it('does not rerun ffprobe unnecessarily for an unchanged asset', async () => {
    const movieFile = path.join(testDir, 'CachedMovie.1080p.mkv');
    await fs.writeFile(movieFile, 'cached media');

    const dummyTechnical: NormalizedTechnicalMetadata = {
      container: 'matroska',
      formatName: 'matroska',
      durationSeconds: 300,
      bitRate: 4000000,
      sizeBytes: 500000,
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

    const spy = new SpyInspector(async () => dummyTechnical);
    const service = new InventoryService(repo, spy);

    // First scan: performs inspection
    const firstScan = await service.scan(testDir);
    expect(firstScan.discovered).toBe(1);
    expect(firstScan.created).toBe(1);
    expect(firstScan.failed).toBe(0);
    expect(spy.callCount).toBe(1);

    // Second scan without changes: does NOT call inspector
    const secondScan = await service.scan(testDir);
    expect(secondScan.discovered).toBe(1);
    expect(secondScan.created).toBe(0);
    expect(secondScan.updated).toBe(0);
    expect(secondScan.failed).toBe(0);
    expect(spy.callCount).toBe(1); // call count must remain 1!
  });
});
