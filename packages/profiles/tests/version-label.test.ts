import { describe, expect, it } from 'bun:test';
import type { MediaVersionWithHierarchy } from '@medialoom/db';
import {
  deriveResolution,
  extractVersionDescriptor,
  generateBaseVersionLabel,
  type MediaVersionDescriptor,
  normalizeAudio,
  normalizeHdr,
  normalizeSource,
  normalizeVideoCodec,
  resolveVersionLabels,
} from '../src/jellyfin/version-label';

describe('Version Label Generator & Collision Resolver', () => {
  describe('normalizeSource', () => {
    it('normalizes various source formats accurately', () => {
      expect(normalizeSource('Ultra HD Blu-ray', '2160p')).toBe('UHD BluRay');
      expect(normalizeSource('UHD BluRay', '2160p')).toBe('UHD BluRay');
      expect(normalizeSource('Blu-ray', '1080p')).toBe('BluRay');
      expect(normalizeSource('BluRay', '2160p')).toBe('UHD BluRay');
      expect(normalizeSource('DVD-Rip')).toBe('DVD');
      expect(normalizeSource('DVD')).toBe('DVD');
      expect(normalizeSource('WEB-DL')).toBe('WEB-DL');
      expect(normalizeSource('WEBRip')).toBe('WEBRip');
      expect(normalizeSource('HDTV')).toBe('HDTV');
      expect(normalizeSource('HD-DVD')).toBe('HD-DVD');
      expect(normalizeSource(null)).toBeNull();
    });
  });

  describe('deriveResolution', () => {
    it('derives resolution from measured technical properties', () => {
      expect(deriveResolution({ width: 3840, height: 2160 })).toBe('2160p');
      expect(deriveResolution({ width: 1920, height: 1080 })).toBe('1080p');
      expect(deriveResolution({ width: 1920, height: 800 })).toBe('1080p'); // widescreen 1080p
      expect(deriveResolution({ width: 1280, height: 720 })).toBe('720p');
      expect(deriveResolution({ width: 720, height: 576 }, null, 'DVD')).toBe('576p');
      expect(deriveResolution({ width: 720, height: 480 }, null, 'DVD')).toBe('480p');
    });

    it('falls back to filename screenSize when technical metadata is absent', () => {
      expect(deriveResolution(null, '1080p')).toBe('1080p');
      expect(deriveResolution(null, '2160p')).toBe('2160p');
      expect(deriveResolution(null, '4k')).toBe('2160p');
      expect(deriveResolution(null, '720p')).toBe('720p');
      expect(deriveResolution(null, '576p')).toBe('576p');
    });
  });

  describe('normalizeVideoCodec & normalizeHdr & normalizeAudio', () => {
    it('normalizes video codecs', () => {
      expect(normalizeVideoCodec('hevc', null)).toBe('HEVC');
      expect(normalizeVideoCodec(null, 'x265')).toBe('x265');
      expect(normalizeVideoCodec('h264', null)).toBe('H.264');
      expect(normalizeVideoCodec(null, 'x264')).toBe('x264');
      expect(normalizeVideoCodec('av1', null)).toBe('AV1');
      expect(normalizeVideoCodec('vc1', null)).toBe('VC-1');
      expect(normalizeVideoCodec('mpeg2video', null)).toBe('MPEG2');
    });

    it('normalizes HDR formats', () => {
      expect(normalizeHdr('Dolby Vision / HDR10')).toBe('DV HDR');
      expect(normalizeHdr('Dolby Vision')).toBe('DV');
      expect(normalizeHdr('HDR10+')).toBe('HDR10+');
      expect(normalizeHdr('HDR10')).toBe('HDR');
      expect(normalizeHdr('HLG')).toBe('HLG');
      expect(normalizeHdr(null, 10)).toBe('10-bit');
      expect(normalizeHdr(null, 8)).toBeNull();
    });

    it('normalizes audio codecs and channels', () => {
      expect(normalizeAudio('truehd', 8)).toBe('TrueHD 7.1');
      expect(normalizeAudio('dts-hd ma', 6)).toBe('DTS-HD MA 5.1');
      expect(normalizeAudio('ac3', 6)).toBe('AC3 5.1');
      expect(normalizeAudio('aac', 2)).toBe('AAC 2.0');
    });
  });

  describe('generateBaseVersionLabel', () => {
    it('generates deterministic base labels', () => {
      expect(
        generateBaseVersionLabel({
          resolution: '2160p',
          source: 'UHD BluRay',
        }),
      ).toBe('2160p UHD BluRay');

      expect(
        generateBaseVersionLabel({
          resolution: '1080p',
          source: 'BluRay',
        }),
      ).toBe('1080p BluRay');

      expect(
        generateBaseVersionLabel({
          resolution: '576p',
          source: 'DVD',
        }),
      ).toBe('576p DVD');

      expect(
        generateBaseVersionLabel({
          resolution: '1080p',
          source: 'WEB-DL',
        }),
      ).toBe('1080p WEB-DL');

      expect(
        generateBaseVersionLabel({
          source: 'DVD',
        }),
      ).toBe('DVD');

      expect(
        generateBaseVersionLabel({
          resolution: '1080p',
        }),
      ).toBe('1080p');
    });
  });

  describe('resolveVersionLabels (Collision Resolution)', () => {
    it('resolves Blu-ray + DVD without collision', () => {
      const v1: MediaVersionDescriptor = { id: 'v1', resolution: '1080p', source: 'BluRay' };
      const v2: MediaVersionDescriptor = { id: 'v2', resolution: '576p', source: 'DVD' };

      const resolved = resolveVersionLabels([v1, v2]);
      expect(resolved.get('v1')).toBe('1080p BluRay');
      expect(resolved.get('v2')).toBe('576p DVD');
    });

    it('resolves 2160p + 1080p without collision', () => {
      const v1: MediaVersionDescriptor = { id: 'v1', resolution: '2160p', source: 'UHD BluRay' };
      const v2: MediaVersionDescriptor = { id: 'v2', resolution: '1080p', source: 'BluRay' };

      const resolved = resolveVersionLabels([v1, v2]);
      expect(resolved.get('v1')).toBe('2160p UHD BluRay');
      expect(resolved.get('v2')).toBe('1080p BluRay');
    });

    it('resolves two 1080p versions with different sources without collision', () => {
      const v1: MediaVersionDescriptor = { id: 'v1', resolution: '1080p', source: 'BluRay' };
      const v2: MediaVersionDescriptor = { id: 'v2', resolution: '1080p', source: 'WEB-DL' };

      const resolved = resolveVersionLabels([v1, v2]);
      expect(resolved.get('v1')).toBe('1080p BluRay');
      expect(resolved.get('v2')).toBe('1080p WEB-DL');
    });

    it('resolves collision: identical resolution/source but different codec', () => {
      const v1: MediaVersionDescriptor = {
        id: 'v1',
        resolution: '1080p',
        source: 'BluRay',
        videoCodec: 'x264',
      };
      const v2: MediaVersionDescriptor = {
        id: 'v2',
        resolution: '1080p',
        source: 'BluRay',
        videoCodec: 'HEVC',
      };

      const resolved = resolveVersionLabels([v1, v2]);
      expect(resolved.get('v1')).toBe('1080p BluRay x264');
      expect(resolved.get('v2')).toBe('1080p BluRay HEVC');
    });

    it('resolves collision: identical resolution/source but different HDR format', () => {
      const v1: MediaVersionDescriptor = {
        id: 'v1',
        resolution: '2160p',
        source: 'UHD BluRay',
        hdrFormat: 'DV HDR',
      };
      const v2: MediaVersionDescriptor = {
        id: 'v2',
        resolution: '2160p',
        source: 'UHD BluRay',
        hdrFormat: null,
      };

      const resolved = resolveVersionLabels([v1, v2]);
      expect(resolved.get('v1')).toBe('2160p UHD BluRay DV HDR');
      expect(resolved.get('v2')).toBe('2160p UHD BluRay');
    });

    it('resolves collision: identical resolution/source/codec but different audio', () => {
      const v1: MediaVersionDescriptor = {
        id: 'v1',
        resolution: '1080p',
        source: 'BluRay',
        videoCodec: 'x264',
        audioCodec: 'truehd',
        audioChannels: 8,
      };
      const v2: MediaVersionDescriptor = {
        id: 'v2',
        resolution: '1080p',
        source: 'BluRay',
        videoCodec: 'x264',
        audioCodec: 'ac3',
        audioChannels: 6,
      };

      const resolved = resolveVersionLabels([v1, v2]);
      expect(resolved.get('v1')).toBe('1080p BluRay TrueHD 7.1');
      expect(resolved.get('v2')).toBe('1080p BluRay AC3 5.1');
    });

    it('resolves duplicate identical rips deterministically via stable index', () => {
      const v1: MediaVersionDescriptor = {
        id: 'v1',
        assetPath: '/movies/blade-runner-rip1.mkv',
        resolution: '1080p',
        source: 'BluRay',
      };
      const v2: MediaVersionDescriptor = {
        id: 'v2',
        assetPath: '/movies/blade-runner-rip2.mkv',
        resolution: '1080p',
        source: 'BluRay',
      };

      const resolved = resolveVersionLabels([v1, v2]);
      expect(resolved.get('v1')).toBe('1080p BluRay (1)');
      expect(resolved.get('v2')).toBe('1080p BluRay (2)');
    });
  });

  describe('extractVersionDescriptor from DB record', () => {
    it('extracts technical and filename metadata correctly', () => {
      const dbVersion: MediaVersionWithHierarchy = {
        id: 'mv-1',
        editionId: 'ed-1',
        name: '1080p BluRay',
        createdAt: new Date(),
        updatedAt: new Date(),
        assets: [
          {
            id: 'ast-1',
            mediaVersionId: 'mv-1',
            type: 'VIDEO',
            path: '/media/The.Matrix.1999.1080p.BluRay.x264.mkv',
            sizeBytes: 8000000000n,
            mtime: new Date(),
            present: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            filenameMetadata: {
              id: 'fn-1',
              assetId: 'ast-1',
              title: 'The Matrix',
              year: 1999,
              type: 'movie',
              edition: null,
              screenSize: '1080p',
              source: 'Blu-ray',
              videoCodec: 'x264',
              audioCodec: 'DTS',
              audioChannels: '5.1',
              releaseGroup: 'FraMeSToR',
              streamingService: null,
              container: 'mkv',
              language: 'en',
              rawJson: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            technicalMetadata: {
              id: 'tech-1',
              assetId: 'ast-1',
              container: 'matroska',
              formatName: 'matroska,webm',
              durationSeconds: 8160,
              bitRate: 8000000n,
              width: 1920,
              height: 1080,
              videoCodec: 'h264',
              frameRate: 23.976,
              bitDepth: 8,
              hdrFormat: null,
              audioCodec: 'dts',
              audioChannels: 6,
              audioLanguage: 'eng',
              audioLayout: '5.1(side)',
              rawJson: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              streams: [],
            },
          },
        ],
      };

      const descriptor = extractVersionDescriptor(dbVersion);
      expect(descriptor.id).toBe('mv-1');
      expect(descriptor.resolution).toBe('1080p');
      expect(descriptor.source).toBe('BluRay');
      expect(descriptor.videoCodec).toBe('x264');
      expect(descriptor.releaseGroup).toBe('FraMeSToR');
      expect(generateBaseVersionLabel(descriptor)).toBe('1080p BluRay');
    });
  });
});
