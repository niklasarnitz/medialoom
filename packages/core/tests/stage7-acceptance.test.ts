import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  candidatesDataSchema,
  cliEnvelopeSchema,
  inspectDataSchema,
  itemsDataSchema,
  matchDataSchema,
  scanDataSchema,
} from '@medialoom/contracts';
import { defaultInventoryRepository, defaultSettingsRepository } from '@medialoom/db';
import { TINY_VIDEO_BUFFER } from '@medialoom/media';
import { runCli } from '../../../apps/cli/src';

describe('Stage 7 Acceptance: External Agent Automation Workflow', () => {
  it('allows an external agent to scan, list, inspect, request candidates, and manually match an item via automation CLI without web UI', async () => {
    // Set up real SQLite DB setting for TMDb provider
    await defaultSettingsRepository.setTmdbApiKey('acceptance_stage7_token_123');

    // Mock network fetch for TMDb calls
    const originalFetch = globalThis.fetch;
    const mockSearchResponse = {
      page: 1,
      results: [
        {
          id: 550,
          title: 'Fight Club',
          release_date: '1999-10-15',
          overview: 'An insomniac office worker and a devil-may-care soap maker...',
          poster_path: '/bptfVGEQuv6vDTIMVCHjJ9Dz8PX.jpg',
        },
      ],
      total_pages: 1,
      total_results: 1,
    };

    const mockDetailsResponse = {
      id: 550,
      title: 'Fight Club',
      release_date: '1999-10-15',
      runtime: 139,
      overview: 'An insomniac office worker and a devil-may-care soap maker...',
      poster_path: '/bptfVGEQuv6vDTIMVCHjJ9Dz8PX.jpg',
      imdb_id: 'tt0137523',
    };

    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/search/movie')) {
        return new Response(JSON.stringify(mockSearchResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('/movie/550')) {
        return new Response(JSON.stringify(mockDetailsResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    }) as unknown as typeof fetch;

    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'medialoom-stage7-agent-'));

    try {
      // Create test media file
      await fs.writeFile(
        path.join(tempDir, 'Fight.Club.1999.1080p.BluRay.x264.mkv'),
        TINY_VIDEO_BUFFER,
      );

      // ----------------------------------------------------------------------
      // Step 1: External Agent scans a directory
      // ----------------------------------------------------------------------
      let scanStdout = '';
      let scanStderr = '';
      const scanExitCode = await runCli(['scan', tempDir, '--json'], {
        stdout: { write: (c) => (scanStdout += c) },
        stderr: { write: (c) => (scanStderr += c) },
      });

      expect(scanExitCode).toBe(0);
      expect(scanStderr).toBe(''); // Pure stdout in --json mode
      const parsedScan = JSON.parse(scanStdout);
      const scanEnvelope = cliEnvelopeSchema(scanDataSchema).parse(parsedScan);
      expect(scanEnvelope.schemaVersion).toBe(1);
      expect(scanEnvelope.command).toBe('scan');
      expect(scanEnvelope.status).toBe('success');
      expect(scanEnvelope.data?.discovered).toBe(1);
      expect(scanEnvelope.data?.created).toBe(1);

      // ----------------------------------------------------------------------
      // Step 2: External Agent lists items in inventory
      // ----------------------------------------------------------------------
      let itemsStdout = '';
      let itemsStderr = '';
      const itemsExitCode = await runCli(['items', '--json'], {
        stdout: { write: (c) => (itemsStdout += c) },
        stderr: { write: (c) => (itemsStderr += c) },
      });

      expect(itemsExitCode).toBe(0);
      expect(itemsStderr).toBe('');
      const parsedItems = JSON.parse(itemsStdout);
      const itemsEnvelope = cliEnvelopeSchema(itemsDataSchema).parse(parsedItems);
      expect(itemsEnvelope.command).toBe('items');
      expect(itemsEnvelope.status).toBe('success');
      expect(itemsEnvelope.data?.items.length).toBeGreaterThanOrEqual(1);

      const fightClubItem = itemsEnvelope.data?.items.find((i) => i.title === 'Fight Club');
      expect(fightClubItem).toBeDefined();
      expect(fightClubItem?.year).toBe(1999);
      expect(fightClubItem?.status).toBe('UNMATCHED');
      if (!fightClubItem) throw new Error('Expected fightClubItem to be defined');
      const itemId = fightClubItem.id;

      // ----------------------------------------------------------------------
      // Step 3: External Agent inspects an item
      // ----------------------------------------------------------------------
      let inspectStdout = '';
      let inspectStderr = '';
      const inspectExitCode = await runCli(['inspect', itemId, '--json'], {
        stdout: { write: (c) => (inspectStdout += c) },
        stderr: { write: (c) => (inspectStderr += c) },
      });

      expect(inspectExitCode).toBe(0);
      expect(inspectStderr).toBe('');
      const parsedInspect = JSON.parse(inspectStdout);
      const inspectEnvelope = cliEnvelopeSchema(inspectDataSchema).parse(parsedInspect);
      expect(inspectEnvelope.command).toBe('inspect');
      expect(inspectEnvelope.status).toBe('success');
      expect(inspectEnvelope.data?.item.id).toBe(itemId);
      expect(inspectEnvelope.data?.item.title).toBe('Fight Club');

      const asset = inspectEnvelope.data?.item.editions[0]?.mediaVersions[0]?.assets[0];
      expect(asset).toBeDefined();
      expect(asset?.filenameMetadata?.screenSize).toBe('1080p');
      expect(asset?.filenameMetadata?.source).toBe('Blu-ray');
      expect(asset?.technicalMetadata?.videoCodec).toBe('h264');

      // ----------------------------------------------------------------------
      // Step 4: External Agent requests match candidates
      // ----------------------------------------------------------------------
      let candidatesStdout = '';
      let candidatesStderr = '';
      const candidatesExitCode = await runCli(['candidates', itemId, '--json'], {
        stdout: { write: (c) => (candidatesStdout += c) },
        stderr: { write: (c) => (candidatesStderr += c) },
      });

      expect(candidatesExitCode).toBe(0);
      expect(candidatesStderr).toBe('');
      const parsedCandidates = JSON.parse(candidatesStdout);
      const candidatesEnvelope = cliEnvelopeSchema(candidatesDataSchema).parse(parsedCandidates);
      expect(candidatesEnvelope.command).toBe('candidates');
      expect(candidatesEnvelope.status).toBe('success');
      expect(candidatesEnvelope.data?.itemId).toBe(itemId);
      expect(candidatesEnvelope.data?.candidates.length).toBe(1);
      expect(candidatesEnvelope.data?.candidates[0]?.tmdbId).toBe(550);
      expect(candidatesEnvelope.data?.candidates[0]?.title).toBe('Fight Club');

      // ----------------------------------------------------------------------
      // Step 5: External Agent manually matches the item using provider ID
      // ----------------------------------------------------------------------
      let matchStdout = '';
      let matchStderr = '';
      const matchExitCode = await runCli(
        ['match', itemId, '--provider', 'tmdb', '--id', '550', '--json', '--no-input'],
        {
          stdout: { write: (c) => (matchStdout += c) },
          stderr: { write: (c) => (matchStderr += c) },
        },
      );

      expect(matchExitCode).toBe(0);
      expect(matchStderr).toBe('');
      const parsedMatch = JSON.parse(matchStdout);
      const matchEnvelope = cliEnvelopeSchema(matchDataSchema).parse(parsedMatch);
      expect(matchEnvelope.command).toBe('match');
      expect(matchEnvelope.status).toBe('success');
      expect(matchEnvelope.data?.matched).toBe(true);
      expect(matchEnvelope.data?.isManual).toBe(true);
      expect(matchEnvelope.data?.candidate?.tmdbId).toBe(550);
      expect(matchEnvelope.data?.candidate?.imdbId).toBe('tt0137523');

      // Verify database state reflects MATCHED status
      const matchedMovieId = matchEnvelope.data?.itemId ?? itemId;
      const updatedMovie = await defaultInventoryRepository.getMovie(matchedMovieId);
      expect(updatedMovie).toBeDefined();
      expect(updatedMovie?.status).toBe('MATCHED');
      expect(updatedMovie?.tmdbId).toBe(550);
      expect(updatedMovie?.imdbId).toBe('tt0137523');
    } finally {
      globalThis.fetch = originalFetch;
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
