import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  candidatesDataSchema,
  cliEnvelopeSchema,
  doctorReportEnvelopeSchema,
  ExitCode,
  type ItemMatchResult,
  inspectDataSchema,
  itemsDataSchema,
  matchDataSchema,
  scanDataSchema,
} from '@medialoom/contracts';
import type { MatchingService, MetadataService } from '@medialoom/core';
import { TINY_VIDEO_BUFFER } from '@medialoom/media';
import { ProviderAuthenticationError, ProviderNetworkError } from '@medialoom/providers';
import { type CliServices, runCli } from '../src';

describe('medialoom CLI', () => {
  it('handles --help and --no-input flags', async () => {
    let stdout = '';
    let stderr = '';
    const code = await runCli(['--help', '--no-input'], {
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

    expect(code).toBe(ExitCode.SUCCESS);
    expect(stdout).toContain('MediaLoom');
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('scan <path>');
    expect(stdout).toContain('items');
    expect(stdout).toContain('inspect <id>');
    expect(stdout).toContain('candidates <id>');
    expect(stdout).toContain('match <id>');
    expect(stdout).toContain('doctor');
    expect(stdout).toContain('Exit Codes:');
    expect(stderr).toBe('');
  });

  it('handles version command in human and --json mode', async () => {
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

    expect(code).toBe(ExitCode.SUCCESS);
    expect(stdout).toBe('medialoom 0.1.0\n');
    expect(stderr).toBe('');

    let jsonStdout = '';
    const jsonCode = await runCli(['version', '--json'], {
      stdout: { write: (c) => (jsonStdout += c) },
      stderr: { write: () => {} },
    });
    expect(jsonCode).toBe(ExitCode.SUCCESS);
    const parsed = JSON.parse(jsonStdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.command).toBe('version');
    expect(parsed.status).toBe('success');
    expect(parsed.data.version).toBe('0.1.0');
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

    expect(code).toBe(ExitCode.SUCCESS);
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

    expect(code).toBe(ExitCode.SUCCESS);
    expect(stderr).toBe('');

    const parsed = JSON.parse(stdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.command).toBe('doctor');
    expect(parsed.status).toBe('success');

    const validated = doctorReportEnvelopeSchema.parse(parsed.data);
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

    expect(result.status).toBe(ExitCode.SUCCESS);
    const rawStdout = result.stdout.trim();
    expect(rawStdout.startsWith('{')).toBe(true);
    expect(rawStdout.endsWith('}')).toBe(true);

    const parsed = JSON.parse(rawStdout);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.command).toBe('doctor');
    expect(parsed.status).toBe('success');
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
      expect(scanHumanCode).toBe(ExitCode.SUCCESS);
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
      expect(scanJsonCode).toBe(ExitCode.SUCCESS);
      expect(scanJsonErr).toBe('');

      const scanResult = JSON.parse(scanJsonOut);
      const scanEnvelope = cliEnvelopeSchema(scanDataSchema).parse(scanResult);
      expect(scanEnvelope.schemaVersion).toBe(1);
      expect(scanEnvelope.command).toBe('scan');
      expect(scanEnvelope.status).toBe('success');
      expect(scanEnvelope.data?.scanId).toBeDefined();
      expect(scanEnvelope.data?.discovered).toBe(1);
      expect(scanEnvelope.data?.created).toBe(0); // idempotent second scan
      expect(scanEnvelope.data?.updated).toBe(0);
      expect(scanEnvelope.data?.failed).toBe(0);

      // 3. items command with --json
      let itemsJsonOut = '';
      let itemsJsonErr = '';
      const itemsCode = await runCli(['items', '--json'], {
        stdout: { write: (c) => (itemsJsonOut += c) },
        stderr: { write: (c) => (itemsJsonErr += c) },
      });
      expect(itemsCode).toBe(ExitCode.SUCCESS);
      expect(itemsJsonErr).toBe('');

      const itemsResult = JSON.parse(itemsJsonOut);
      const itemsEnvelope = cliEnvelopeSchema(itemsDataSchema).parse(itemsResult);
      expect(itemsEnvelope.schemaVersion).toBe(1);
      expect(itemsEnvelope.command).toBe('items');
      expect(itemsEnvelope.status).toBe('success');
      expect(Array.isArray(itemsEnvelope.data?.items)).toBe(true);

      const matrix = itemsEnvelope.data?.items.find((i) => i.title === 'The Matrix');
      expect(matrix).toBeDefined();
      expect(matrix?.year).toBe(1999);
      if (!matrix) throw new Error('Expected matrix to be defined');

      // 4. inspect command with --json
      let inspectJsonOut = '';
      let inspectJsonErr = '';
      const inspectCode = await runCli(['inspect', matrix.id, '--json'], {
        stdout: { write: (c) => (inspectJsonOut += c) },
        stderr: { write: (c) => (inspectJsonErr += c) },
      });
      expect(inspectCode).toBe(ExitCode.SUCCESS);
      expect(inspectJsonErr).toBe('');

      const inspectResult = JSON.parse(inspectJsonOut);
      const inspectEnvelope = cliEnvelopeSchema(inspectDataSchema).parse(inspectResult);
      expect(inspectEnvelope.schemaVersion).toBe(1);
      expect(inspectEnvelope.command).toBe('inspect');
      expect(inspectEnvelope.status).toBe('success');
      expect(inspectEnvelope.data?.item.id).toBe(matrix.id);
      expect(inspectEnvelope.data?.item.title).toBe('The Matrix');

      const asset = inspectEnvelope.data?.item.editions[0]?.mediaVersions[0]?.assets[0];
      expect(asset?.filenameMetadata?.screenSize).toBe('1080p');
      expect(asset?.filenameMetadata?.source).toBe('Blu-ray');
      expect(asset?.filenameMetadata?.releaseGroup).toBe('GROUP');

      // Exposes technical metadata
      expect(asset?.filenameMetadata).toBeDefined();
      expect(asset?.technicalMetadata).toBeDefined();
      expect(asset?.technicalMetadata?.width).toBe(16);
      expect(asset?.technicalMetadata?.height).toBe(16);
      expect(asset?.technicalMetadata?.videoCodec).toBe('h264');
      expect(Array.isArray(asset?.technicalMetadata?.streams)).toBe(true);

      // Also verify inspect in human mode prints technical metadata
      let inspectHumanOut = '';
      let inspectHumanErr = '';
      const inspectHumanCode = await runCli(['inspect', matrix.id], {
        stdout: { write: (c) => (inspectHumanOut += c) },
        stderr: { write: (c) => (inspectHumanErr += c) },
      });
      expect(inspectHumanCode).toBe(ExitCode.SUCCESS);
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
      expect(missingCode).toBe(ExitCode.GENERIC_FAILURE);
      expect(missingErr).toContain('Item not found');

      // 6. inspect non-existent item in --json mode
      let missingJsonOut = '';
      let missingJsonErr = '';
      const missingJsonCode = await runCli(['inspect', 'non-existent-id', '--json'], {
        stdout: { write: (c) => (missingJsonOut += c) },
        stderr: { write: (c) => (missingJsonErr += c) },
      });
      expect(missingJsonCode).toBe(ExitCode.GENERIC_FAILURE);
      expect(missingJsonErr).toBe('');
      const parsedMissing = JSON.parse(missingJsonOut);
      expect(parsedMissing.schemaVersion).toBe(1);
      expect(parsedMissing.command).toBe('inspect');
      expect(parsedMissing.status).toBe('error');
      expect(parsedMissing.error.code).toBe('ITEM_NOT_FOUND');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('handles invalid argument exit status (ExitCode 2)', async () => {
    // Missing scan path
    let scanErr = '';
    const scanCode = await runCli(['scan'], {
      stdout: { write: () => {} },
      stderr: { write: (c) => (scanErr += c) },
    });
    expect(scanCode).toBe(ExitCode.INVALID_INPUT);
    expect(scanErr).toContain('Missing required <path>');

    // Missing inspect id
    let inspectErr = '';
    const inspectCode = await runCli(['inspect'], {
      stdout: { write: () => {} },
      stderr: { write: (c) => (inspectErr += c) },
    });
    expect(inspectCode).toBe(ExitCode.INVALID_INPUT);
    expect(inspectErr).toContain('Missing required <id>');

    // Missing candidates id
    let candErr = '';
    const candCode = await runCli(['candidates'], {
      stdout: { write: () => {} },
      stderr: { write: (c) => (candErr += c) },
    });
    expect(candCode).toBe(ExitCode.INVALID_INPUT);
    expect(candErr).toContain('Missing required <id>');

    // Missing match id
    let matchErr = '';
    const matchCode = await runCli(['match'], {
      stdout: { write: () => {} },
      stderr: { write: (c) => (matchErr += c) },
    });
    expect(matchCode).toBe(ExitCode.INVALID_INPUT);
    expect(matchErr).toContain('Missing required <id>');

    // Unknown command
    let unknownErr = '';
    const unknownCode = await runCli(['invalid_command_xyz'], {
      stdout: { write: () => {} },
      stderr: { write: (c) => (unknownErr += c) },
    });
    expect(unknownCode).toBe(ExitCode.INVALID_INPUT);
    expect(unknownErr).toContain('Unknown command');
  });

  it('handles candidates command for an item in human and --json mode', async () => {
    const mockMovie = {
      id: 'movie_matrix_id',
      title: 'The Matrix',
      year: 1999,
      status: 'UNMATCHED' as const,
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
          throw new Error(`MediaItem "${id}" not found in inventory.`);
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

    expect(jsonCode).toBe(ExitCode.SUCCESS);
    expect(jsonErr).toBe('');
    const parsed = JSON.parse(jsonOut);
    const envelope = cliEnvelopeSchema(candidatesDataSchema).parse(parsed);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.command).toBe('candidates');
    expect(envelope.status).toBe('success');
    expect(envelope.data?.itemId).toBe('movie_matrix_id');
    expect(envelope.data?.query).toBe('The Matrix');
    expect(envelope.data?.year).toBe(1999);
    expect(envelope.data?.candidates.length).toBe(1);
    expect(envelope.data?.candidates[0]?.tmdbId).toBe(603);

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

    expect(humanCode).toBe(ExitCode.SUCCESS);
    expect(humanOut).toContain('The Matrix (1999)');
    expect(humanOut).toContain('[TMDB 603]');
    expect(humanOut).toContain('Candidates (1 found)');
  });

  it('handles match command in automatic, manual override, and review-required modes', async () => {
    const mockAutoResult: ItemMatchResult = {
      itemId: 'movie_matrix_id',
      decision: 'AUTO_MATCH',
      score: 0.98,
      components: {
        title: 0.6,
        year: 0.25,
        runtime: 0.1,
        providerRank: 0.05,
        penalty: 0,
      },
      selectedCandidate: {
        provider: 'tmdb',
        providerId: '603',
        title: 'The Matrix',
        year: 1999,
        runtimeMinutes: 136,
        tmdbId: 603,
        imdbId: 'tt0133093',
      },
      evaluations: [
        {
          candidate: {
            provider: 'tmdb',
            providerId: '603',
            title: 'The Matrix',
            year: 1999,
            tmdbId: 603,
          },
          score: 0.98,
          components: {
            title: 0.6,
            year: 0.25,
            runtime: 0.1,
            providerRank: 0.05,
            penalty: 0,
          },
          rank: 0,
          reasons: ['Title exact match', 'Year exact match'],
        },
      ],
      isManual: false,
    };

    const mockReviewResult: ItemMatchResult = {
      itemId: 'movie_ambiguous_id',
      decision: 'REVIEW_REQUIRED',
      score: 0.75,
      components: {
        title: 0.5,
        year: 0.15,
        runtime: 0.05,
        providerRank: 0.05,
        penalty: 0,
      },
      selectedCandidate: null,
      evaluations: [],
      isManual: false,
    };

    const mockManualResult: ItemMatchResult = {
      itemId: 'movie_matrix_id',
      decision: 'AUTO_MATCH',
      score: 1.0,
      components: {
        title: 0.6,
        year: 0.25,
        runtime: 0.1,
        providerRank: 0.05,
        penalty: 0,
      },
      selectedCandidate: {
        provider: 'tmdb',
        providerId: '603',
        title: 'The Matrix',
        year: 1999,
        runtimeMinutes: 136,
        tmdbId: 603,
        imdbId: 'tt0133093',
      },
      evaluations: [],
      isManual: true,
    };

    const mockServices: CliServices = {
      matchingService: {
        matchItem: async (id: string) => {
          if (id === 'movie_matrix_id') return mockAutoResult;
          if (id === 'movie_ambiguous_id') return mockReviewResult;
          throw new Error(`MediaItem "${id}" not found in inventory.`);
        },
        manualMatch: async (id: string, info: { provider: string; id: string | number }) => {
          if (id === 'movie_matrix_id' && String(info.id) === '603') return mockManualResult;
          throw new Error('Manual match failed');
        },
      } as unknown as MatchingService,
    };

    // 1. match <id> (auto match success -> ExitCode 0)
    let autoOut = '';
    const autoCode = await runCli(
      ['match', 'movie_matrix_id'],
      {
        stdout: { write: (c) => (autoOut += c) },
        stderr: { write: () => {} },
      },
      mockServices,
    );
    expect(autoCode).toBe(ExitCode.SUCCESS);
    expect(autoOut).toContain('MediaLoom Match Decision');
    expect(autoOut).toContain('Decision:  AUTO_MATCH');

    // 2. match <id> in --json mode
    let jsonOut = '';
    const jsonCode = await runCli(
      ['match', 'movie_matrix_id', '--json'],
      {
        stdout: { write: (c) => (jsonOut += c) },
        stderr: { write: () => {} },
      },
      mockServices,
    );
    expect(jsonCode).toBe(ExitCode.SUCCESS);
    const parsedAuto = JSON.parse(jsonOut);
    const autoEnvelope = cliEnvelopeSchema(matchDataSchema).parse(parsedAuto);
    expect(autoEnvelope.schemaVersion).toBe(1);
    expect(autoEnvelope.command).toBe('match');
    expect(autoEnvelope.status).toBe('success');
    expect(autoEnvelope.data?.decision).toBe('AUTO_MATCH');
    expect(autoEnvelope.data?.matched).toBe(true);
    expect(autoEnvelope.data?.candidate?.tmdbId).toBe(603);

    // 3. match <id> with REVIEW_REQUIRED -> ExitCode 3
    let reviewJsonOut = '';
    const reviewCode = await runCli(
      ['match', 'movie_ambiguous_id', '--json'],
      {
        stdout: { write: (c) => (reviewJsonOut += c) },
        stderr: { write: () => {} },
      },
      mockServices,
    );
    expect(reviewCode).toBe(ExitCode.REVIEW_REQUIRED);
    const parsedReview = JSON.parse(reviewJsonOut);
    expect(parsedReview.data.decision).toBe('REVIEW_REQUIRED');
    expect(parsedReview.data.matched).toBe(false);

    // 4. match <id> manual override
    let manualJsonOut = '';
    const manualJsonCode = await runCli(
      ['match', 'movie_matrix_id', '--provider', 'tmdb', '--id', '603', '--json'],
      {
        stdout: { write: (c) => (manualJsonOut += c) },
        stderr: { write: () => {} },
      },
      mockServices,
    );
    expect(manualJsonCode).toBe(ExitCode.SUCCESS);
    const parsedManual = JSON.parse(manualJsonOut);
    expect(parsedManual.data.decision).toBe('AUTO_MATCH');
    expect(parsedManual.data.isManual).toBe(true);
  });

  it('maps provider and network errors to ExitCode 4', async () => {
    const mockServices: CliServices = {
      metadataService: {
        getCandidatesForItem: async () => {
          throw new ProviderAuthenticationError('TMDb API key missing or invalid');
        },
      } as unknown as MetadataService,
      matchingService: {
        matchItem: async () => {
          throw new ProviderNetworkError('Network connectivity failure to TMDb API');
        },
      } as unknown as MatchingService,
    };

    // 1. candidates provider auth failure
    let candJsonOut = '';
    const candCode = await runCli(
      ['candidates', 'movie_1', '--json'],
      {
        stdout: { write: (c) => (candJsonOut += c) },
        stderr: { write: () => {} },
      },
      mockServices,
    );
    expect(candCode).toBe(ExitCode.PROVIDER_ERROR);
    const parsedCand = JSON.parse(candJsonOut);
    expect(parsedCand.status).toBe('error');
    expect(parsedCand.error.code).toBe('PROVIDER_AUTH_ERROR');

    // 2. match provider network failure
    let matchJsonOut = '';
    const matchCode = await runCli(
      ['match', 'movie_1', '--json'],
      {
        stdout: { write: (c) => (matchJsonOut += c) },
        stderr: { write: () => {} },
      },
      mockServices,
    );
    expect(matchCode).toBe(ExitCode.PROVIDER_ERROR);
    const parsedMatch = JSON.parse(matchJsonOut);
    expect(parsedMatch.status).toBe('error');
    expect(parsedMatch.error.code).toBe('PROVIDER_NETWORK_ERROR');
  });
});
