import { describe, expect, it } from 'bun:test';
import { parseFilename } from '../src';

describe('GuessitAdapter', () => {
  it('parses and normalizes The Matrix (1999)', () => {
    const filename = 'The.Matrix.1999.1080p.BluRay.x264-GROUP.mkv';
    const result = parseFilename(filename);

    expect(result.title).toBe('The Matrix');
    expect(result.year).toBe(1999);
    expect(result.screenSize).toBe('1080p');
    expect(result.source).toBe('Blu-ray');
    expect(result.videoCodec).toBe('H.264');
    expect(result.releaseGroup).toBe('GROUP');
    expect(result.container).toBe('mkv');
    expect(result.type).toBe('movie');
    expect(result.edition).toBeNull();

    // Verify raw/normalized separation and valid rawJson
    expect(result.rawJson).toBeDefined();
    const raw = JSON.parse(result.rawJson);
    expect(raw.screen_size).toBe('1080p');
    expect(raw.video_codec).toBe('H.264');
  });

  it('parses and normalizes Blade Runner 2049 (2017)', () => {
    const filename = 'Blade.Runner.2049.2017.2160p.UHD.BluRay.mkv';
    const result = parseFilename(filename);

    expect(result.title).toBe('Blade Runner 2049');
    expect(result.year).toBe(2017);
    expect(result.screenSize).toBe('2160p');
    expect(result.source).toBe('Ultra HD Blu-ray');
    expect(result.container).toBe('mkv');
    expect(result.type).toBe('movie');
  });

  it('parses and normalizes Alien (1979)', () => {
    const filename = 'Alien (1979).mkv';
    const result = parseFilename(filename);

    expect(result.title).toBe('Alien');
    expect(result.year).toBe(1979);
    expect(result.container).toBe('mkv');
    expect(result.type).toBe('movie');
  });

  it('parses and normalizes edition information (The Lord of the Rings Extended)', () => {
    const filename =
      'The.Lord.of.the.Rings.The.Fellowship.of.the.Ring.2001.Extended.1080p.BluRay.mkv';
    const result = parseFilename(filename);

    expect(result.title).toBe('The Lord of the Rings The Fellowship of the Ring');
    expect(result.year).toBe(2001);
    expect(result.edition).toBe('Extended');
    expect(result.screenSize).toBe('1080p');
    expect(result.source).toBe('Blu-ray');
    expect(result.container).toBe('mkv');
  });

  it('normalizes audio codecs, audio channels, and streaming services', () => {
    const filename = 'Movie.Title.2023.NF.WEB-DL.DDP5.1.Atmos.H.264.mkv';
    const result = parseFilename(filename);

    expect(result.title).toBe('Movie Title');
    expect(result.year).toBe(2023);
    expect(result.streamingService).toBe('Netflix');
    expect(result.audioChannels).toBe('5.1');
    expect(result.source).toBe('Web');
    expect(result.videoCodec).toBe('H.264');
  });

  it('normalizes language objects from GuessIt', () => {
    const filename = 'Movie.2020.Multi.German.English.mkv';
    const result = parseFilename(filename);

    expect(result.language).not.toBeNull();
    expect(result.language).toContain('German');
    expect(result.language).toContain('English');
  });

  it('handles paths by stripping directories before parsing', () => {
    const fullPath = '/Volumes/Movies/SciFi/The.Matrix.1999.1080p.BluRay.x264-GROUP.mkv';
    const result = parseFilename(fullPath);

    expect(result.title).toBe('The Matrix');
    expect(result.year).toBe(1999);
  });
});
