import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverMediaFiles, SUPPORTED_EXTENSIONS } from '../src';

describe('MediaScanner', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), 'medialoom-scanner-test-'));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('recursively discovers supported media extensions and ignores unsupported files', async () => {
    // Create nested directory structure
    const sub1 = path.join(testDir, 'Movies', 'The Matrix (1999)');
    const sub2 = path.join(testDir, 'Movies', 'Blade Runner (1982)');
    await fs.mkdir(sub1, { recursive: true });
    await fs.mkdir(sub2, { recursive: true });

    // Supported extensions: .mkv, .mp4, .m4v, .avi, .mov, .ts, .m2ts
    const supportedFiles = [
      path.join(sub1, 'The.Matrix.1999.1080p.BluRay.x264-GROUP.mkv'),
      path.join(sub2, 'Blade.Runner.1982.Final.Cut.mp4'),
      path.join(testDir, 'sample.m4v'),
      path.join(testDir, 'video.avi'),
      path.join(testDir, 'clip.mov'),
      path.join(testDir, 'stream.ts'),
      path.join(testDir, 'capture.m2ts'),
    ];

    for (const f of supportedFiles) {
      await fs.writeFile(f, 'dummy video content');
    }

    // Unsupported files: .nfo, .srt, .txt, .jpg, .DS_Store
    const unsupportedFiles = [
      path.join(sub1, 'The.Matrix.1999.nfo'),
      path.join(sub1, 'The.Matrix.1999.en.srt'),
      path.join(sub2, 'notes.txt'),
      path.join(sub2, 'poster.jpg'),
      path.join(testDir, '.DS_Store'),
    ];

    for (const f of unsupportedFiles) {
      await fs.writeFile(f, 'metadata or image content');
    }

    const discovered = await discoverMediaFiles(testDir);
    expect(discovered).toHaveLength(supportedFiles.length);

    const discoveredBasenames = discovered.map((d) => path.basename(d.path)).sort();
    const expectedBasenames = supportedFiles.map((f) => path.basename(f)).sort();
    expect(discoveredBasenames).toEqual(expectedBasenames);

    for (const file of discovered) {
      expect(SUPPORTED_EXTENSIONS.has(file.extension)).toBe(true);
      expect(file.sizeBytes).toBeGreaterThan(0);
      expect(file.mtime).toBeInstanceOf(Date);
      expect(file.parsed.title).toBeDefined();
    }
  });

  it('safely handles symlinks without infinite recursion on cycles', async () => {
    const movieDir = path.join(testDir, 'Movies');
    await fs.mkdir(movieDir, { recursive: true });

    const movieFile = path.join(movieDir, 'Alien (1979).mkv');
    await fs.writeFile(movieFile, 'video data');

    // 1. Valid file symlink
    const symlinkFile = path.join(testDir, 'Alien-Symlink.mkv');
    await fs.symlink(movieFile, symlinkFile);

    // 2. Directory symlink creating a recursive cycle
    const cyclicDir = path.join(movieDir, 'loop-link');
    await fs.symlink(movieDir, cyclicDir);

    // 3. Broken symlink
    const brokenLink = path.join(testDir, 'Broken.mkv');
    await fs.symlink(path.join(testDir, 'non-existent-target.mkv'), brokenLink);

    const discovered = await discoverMediaFiles(testDir);

    // Both the real file and symlink resolve to Alien (1979).mkv canonical path
    expect(discovered.length).toBeGreaterThanOrEqual(1);
    const alienEntries = discovered.filter((d) => d.parsed.title === 'Alien');
    expect(alienEntries.length).toBeGreaterThanOrEqual(1);
  });

  it('guarantees pure read-only behavior: media files are untouched', async () => {
    const filePath = path.join(testDir, 'Blade.Runner.2049.2017.2160p.UHD.BluRay.mkv');
    const content = 'strictly read only test data';
    await fs.writeFile(filePath, content);

    const beforeStat = await fs.stat(filePath);
    await discoverMediaFiles(testDir);
    const afterStat = await fs.stat(filePath);

    expect(afterStat.size).toBe(beforeStat.size);
    expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
    const readContent = await fs.readFile(filePath, 'utf-8');
    expect(readContent).toBe(content);
  });

  it('throws an error when scan path is not a directory', async () => {
    const notADir = path.join(testDir, 'file.mkv');
    await fs.writeFile(notADir, 'data');

    expect(discoverMediaFiles(notADir)).rejects.toThrow('Scan path is not a directory');
  });
});
