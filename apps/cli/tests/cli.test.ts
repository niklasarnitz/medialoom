import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { doctorReportEnvelopeSchema, scanResultSchema } from '@medialoom/contracts';
import type { MetadataService } from '@medialoom/core';
import { TINY_VIDEO_BUFFER } from '@medialoom/media';
import { type CliServices, runCli } from '../src';

describe('medialoom CLI', () => {
  it('handles --help flag', async () => {
    let stdout = '';
    let stderr = '';
    const code = await runCli(['--help'], {
      stdout: {
        write: (c) => {
          stdout += c;
        },
      },
      stderr: {
        write: (c) => {
          stderr += c;
        },
      },
    });

    expect(code).toBe(0);
    expect(stdout).toContain('MediaLoom');
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('scan <path>');
    expect(stdout).toContain('items');
    expect(stdout).toContain('inspect <id>');
    expect(stdout).toContain('doctor');
    expect(stderr).toBe('');
  });

  it('handles version command', async () => {
    let stdout = '';
    let stderr = '';
    const code = await runCli(['version'], {
      stdout: {
        write: (c) => {
          stdout += c;
        },
      },
      stderr: {
        write: (c) => {
          stderr += c;
        },
      },
    });

    expect(code).toBe(0);
    expect(stdout).toBe('medialoom 0.1.0\n');
    expect(stderr).toBe('');
  });

  it('handles doctor command in human mode', async () => {
    let stdout = '';
    let stderr = '';
    const code = await runCli(['doctor'], {
      stdout: {
        write: (c) => {
          stdout += c;
        },
      },
      stderr: {
        write: (c) => {
          stderr += c;
        },
      },
    });

    expect(code).toBe(0);
    expect(stdout).toContain('MediaLoom Diagnostics');
    expect(stdout).toContain('Checks:');
    expect(stderr).toBe('');
  });

  it('handles doctor --json by emitting a valid versioned envelope', async () => {
    let stdout = '';
    let stderr = '';
    const code = await runCli(['doctor', '--json'], {
      stdout: {
        write: (c) => {
          stdout += c;
        },
      },
      stderr: {
        write: (c) => {
          stderr += c;
        },
      },
    });

    expect(code).toBe(0);
    expect(stderr).toBe('');

    // Must parse directly as JSON
    const parsed = JSON.parse(stdout);
    const validated = doctorReportEnvelopeSchema.parse(parsed);

    expect(validated.schemaVersion).toBe(1);
    expect(validated.version).toBe('0.1.0');
    expect(Array.isArray(validated.checks)).toBe(true);
    expect(validated.checks.some((c) => c.name === 'database')).toBe(true);
  });

  it('executes as a standalone binary and outputs only valid JSON to stdout for doctor --json', () => {
    const result = spawnSync('bun', ['apps/cli/bin/medialoom.ts', 'doctor', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    const rawStdout = result.stdout.trim();
    expect(rawStdout.startsWith('{')).toBe(true);
    expect(rawStdout.endsWith('}')).toBe(true);

    const parsed = JSON.parse(rawStdout);
    const validated = doctorReportEnvelopeSchema.parse(parsed);
    expect(validated.schemaVersion).toBe(1);
  });

  it('handles scan, items, and inspect end-to-end via CLI in human and --json mode', async () => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'medialoom-cli-test-'));
    try {
      const fixtureName = 'The.Matrix.1999.1080p.BluRay.x264-GROUP.mkv';
      await fs.writeFile(path.join(tempDir, fixtureName), TINY_VIDEO_BUFFER);

      // 1. scan command in human mode
      let scanHumanOut = '';
      let scanHumanErr = '';
      const scanHumanCode = await runCli(['scan', tempDir], {
        stdout: { write: (c) => (scanHumanOut += c) },
        stderr: { write: (c) => (scanHumanErr += c) },
      });
      expect(scanHumanCode).toBe(0);
      expect(scanHumanOut).toContain('MediaLoom Scan Report');
      expect(scanHumanOut).toContain('Discovered: 1');
      expect(scanHumanOut).toContain('Created:    1');

      // 2. scan command with --json
      let scanJsonOut = '';
      let scanJsonErr = '';
      const scanJsonCode = await runCli(['scan', tempDir, '--json'], {
        stdout: { write: (c) => (scanJsonOut += c) },
        stderr: { write: (c) => (scanJsonErr += c) },
      });
      expect(scanJsonCode).toBe(0);
      expect(scanJsonErr).toBe('');

      const scanResult = JSON.parse(scanJsonOut);
      const validatedScan = scanResultSchema.parse(scanResult);
      expect(validatedScan.schemaVersion).toBe(1);
      expect(validatedScan.scanId).toBeDefined();
      expect(validatedScan.discovered).toBe(1);
      expect(validatedScan.created).toBe(0); // idempotent second scan
      expect(validatedScan.updated).toBe(0);
      expect(validatedScan.failed).toBe(0);

      // 3. items command with --json
      let itemsJsonOut = '';
      let itemsJsonErr = '';
      const itemsCode = await runCli(['items', '--json'], {
        stdout: { write: (c) => (itemsJsonOut += c) },
        stderr: { write: (c) => (itemsJsonErr += c) },
      });
      expect(itemsCode).toBe(0);
      expect(itemsJsonErr).toBe('');

      const itemsResult = JSON.parse(itemsJsonOut);
      expect(itemsResult.schemaVersion).toBe(1);
      expect(Array.isArray(itemsResult.items)).toBe(true);

      const matrix = itemsResult.items.find((i: { title: string }) => i.title === 'The Matrix');
      expect(matrix).toBeDefined();
      expect(matrix.year).toBe(1999);

      // 4. inspect command with --json
      let inspectJsonOut = '';
      let inspectJsonErr = '';
      const inspectCode = await runCli(['inspect', matrix.id, '--json'], {
        stdout: { write: (c) => (inspectJsonOut += c) },
        stderr: { write: (c) => (inspectJsonErr += c) },
      });
      expect(inspectCode).toBe(0);
      expect(inspectJsonErr).toBe('');

      const inspectResult = JSON.parse(inspectJsonOut);
      expect(inspectResult.schemaVersion).toBe(1);
      expect(inspectResult.item.id).toBe(matrix.id);
      expect(inspectResult.item.title).toBe('The Matrix');

      const asset = inspectResult.item.editions[0].mediaVersions[0].assets[0];
      expect(asset.filenameMetadata.screenSize).toBe('1080p');
      expect(asset.filenameMetadata.source).toBe('Blu-ray');
      expect(asset.filenameMetadata.releaseGroup).toBe('GROUP');

      // 4b. Acceptance requirement: inspect ITEM_ID --json exposes clearly separated metadata
      expect(asset.filenameMetadata).toBeDefined();
      expect(asset.technicalMetadata).toBeDefined();
      expect(asset.technicalMetadata.width).toBe(16);
      expect(asset.technicalMetadata.height).toBe(16);
      expect(asset.technicalMetadata.videoCodec).toBe('h264');
      expect(Array.isArray(asset.technicalMetadata.streams)).toBe(true);

      // Also verify inspect in human mode prints technical metadata
      let inspectHumanOut = '';
      let inspectHumanErr = '';
      const inspectHumanCode = await runCli(['inspect', matrix.id], {
        stdout: { write: (c) => (inspectHumanOut += c) },
        stderr: { write: (c) => (inspectHumanErr += c) },
      });
      expect(inspectHumanCode).toBe(0);
      expect(inspectHumanErr).toBe('');
      expect(inspectHumanOut).toContain('Filename Metadata:');
      expect(inspectHumanOut).toContain('Technical Metadata:');
      expect(inspectHumanOut).toContain('16x16');
      expect(inspectHumanOut).toContain('h264');

      // 5. inspect non-existent item
      let missingOut = '';
      let missingErr = '';
      const missingCode = await runCli(['inspect', 'non-existent-id'], {
        stdout: { write: (c) => (missingOut += c) },
        stderr: { write: (c) => (missingErr += c) },
      });
      expect(missingCode).toBe(1);
      expect(missingErr).toContain('Item not found');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('executes scan --json as a standalone binary emitting pure JSON', async () => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'medialoom-cli-bin-test-'));
    try {
      await fs.writeFile(
        path.join(tempDir, 'Blade.Runner.2049.2017.2160p.UHD.BluRay.mkv'),
        TINY_VIDEO_BUFFER,
      );

      const result = spawnSync('bun', ['apps/cli/bin/medialoom.ts', 'scan', tempDir, '--json'], {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      const rawStdout = result.stdout.trim();
      expect(rawStdout.startsWith('{')).toBe(true);
      expect(rawStdout.endsWith('}')).toBe(true);

      const parsed = JSON.parse(rawStdout);
      expect(parsed.scanId).toBeDefined();
      expect(parsed.discovered).toBe(1);
      expect(parsed.created).toBe(1);
      expect(parsed.failed).toBe(0);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('handles config get and set via CLI in human and --json mode', async () => {
    // 1. Set key via config set
    let setOut = '';
    let setErr = '';
    const setCode = await runCli(['config', 'set', 'tmdb_api_key', 'test_key_abc12345'], {
      stdout: { write: (c) => (setOut += c) },
      stderr: { write: (c) => (setErr += c) },
    });
    expect(setCode).toBe(0);
    expect(setOut).toContain('✓ TMDb API key saved successfully');

    // 2. Get key via config get in human mode
    let getHumanOut = '';
    const getHumanCode = await runCli(['config', 'get', 'tmdb_api_key'], {
      stdout: { write: (c) => (getHumanOut += c) },
      stderr: { write: () => {} },
    });
    expect(getHumanCode).toBe(0);
    expect(getHumanOut).toContain('test...2345 (configured in SQLite)');
    expect(getHumanOut).not.toContain('test_key_abc12345'); // Never log full token!

    // 3. Get key via config get --json
    let getJsonOut = '';
    const getJsonCode = await runCli(['config', 'get', 'tmdb_api_key', '--json'], {
      stdout: { write: (c) => (getJsonOut += c) },
      stderr: { write: () => {} },
    });
    expect(getJsonCode).toBe(0);
    const parsedGet = JSON.parse(getJsonOut);
    expect(parsedGet.schemaVersion).toBe(1);
    expect(parsedGet.key).toBe('tmdb_api_key');
    expect(parsedGet.configured).toBe(true);
    expect(parsedGet.masked).toBe(true);
    expect(parsedGet.value).toBe('test...2345');
  });

  it('handles candidates command for an item in human and --json mode', async () => {
    // Mock metadataService and inventoryService
    const mockMovie = {
      id: 'movie_matrix_id',
      title: 'The Matrix',
      year: 1999,
      status: 'UNMATCHED',
      createdAt: new Date(),
      updatedAt: new Date(),
      editions: [],
    };

    const mockCandidates = [
      {
        provider: 'tmdb',
        providerId: '603',
        title: 'The Matrix',
        year: 1999,
        tmdbId: 603,
        overview: 'Set in the 22nd century...',
        posterUrl: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
      },
    ];

    const mockServices: CliServices = {
      metadataService: {
        getCandidatesForItem: async (id: string) => {
          if (id === 'movie_matrix_id') {
            return {
              item: mockMovie,
              query: 'The Matrix',
              year: 1999,
              candidates: mockCandidates,
            };
          }
          throw new Error(`MediaItem "${id}" not found`);
        },
        searchMovies: async () => mockCandidates,
        getMovie: async () => mockCandidates[0],
      } as unknown as MetadataService,
    };

    // 1. candidates with --json
    let jsonOut = '';
    let jsonErr = '';
    const jsonCode = await runCli(
      ['candidates', 'movie_matrix_id', '--json'],
      {
        stdout: { write: (c) => (jsonOut += c) },
        stderr: { write: (c) => (jsonErr += c) },
      },
      mockServices,
    );

    expect(jsonCode).toBe(0);
    expect(jsonErr).toBe('');
    const parsed = JSON.parse(jsonOut);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.itemId).toBe('movie_matrix_id');
    expect(parsed.query).toBe('The Matrix');
    expect(parsed.year).toBe(1999);
    expect(parsed.candidates.length).toBe(1);
    expect(parsed.candidates[0].tmdbId).toBe(603);

    // 2. candidates in human mode
    let humanOut = '';
    const humanCode = await runCli(
      ['candidates', 'movie_matrix_id'],
      {
        stdout: { write: (c) => (humanOut += c) },
        stderr: { write: () => {} },
      },
      mockServices,
    );

    expect(humanCode).toBe(0);
    expect(humanOut).toContain('The Matrix (1999)');
    expect(humanOut).toContain('[TMDB 603]');
    expect(humanOut).toContain('Candidates (1 found)');

    // 3. candidates with missing item ID
    let missingOut = '';
    let missingErr = '';
    const missingCode = await runCli(
      ['candidates'],
      {
        stdout: { write: (c) => (missingOut += c) },
        stderr: { write: (c) => (missingErr += c) },
      },
      mockServices,
    );

    expect(missingCode).toBe(1);
    expect(missingErr).toContain('Missing required <id>');
  });
});
