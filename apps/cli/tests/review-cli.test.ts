import { describe, expect, it } from 'bun:test';
import { ExitCode, type OperationPlanDto, type ReviewQueueItemDto } from '@medialoom/contracts';
import type { PlanExecutor, ReviewService } from '@medialoom/core';
import { type CliServices, runCli } from '../src';

describe('medialoom review CLI commands', () => {
  const mockReviewItem: ReviewQueueItemDto = {
    id: 'rev_123',
    type: 'FILESYSTEM_CHANGE',
    status: 'PENDING',
    mediaItemId: 'movie_123',
    operationPlanId: 'plan_123',
    title: 'Reorganize: Blade Runner (1982)',
    summary:
      'Blade Runner (1982)\n\n2 files will be reorganized:\n\nMOVE\n/in/br.mkv\n→\n/out/br.mkv\n\nWRITE\nmovie.nfo',
    details: {
      affectedMovie: {
        id: 'movie_123',
        title: 'Blade Runner',
        year: 1982,
        status: 'MATCHED',
      },
      reason: 'Reorganize media files according to jellyfin layout',
      destinationRoot: '/movies',
      directoriesToCreate: [{ path: '/movies/Blade Runner (1982)' }],
      filesToMove: [
        {
          source: '/in/br.mkv',
          destination: '/movies/Blade Runner (1982)/Blade Runner (1982).mkv',
          edition: 'Final Cut',
        },
      ],
      filesToWrite: [
        {
          path: '/movies/Blade Runner (1982)/movie.nfo',
          filename: 'movie.nfo',
          type: 'nfo',
          sizeChars: 200,
        },
      ],
      versionNamingChanges: ['Edition: Final Cut'],
      validation: {
        valid: true,
        issues: [],
      },
      warnings: [],
      conflicts: [],
    },
    createdAt: new Date('2026-09-14T12:00:00Z'),
    reviewedAt: null,
    approvedAt: null,
    rejectedAt: null,
  };

  const mockReviewService = {
    listReviewItems: async () => [mockReviewItem],
    getReviewItem: async (id: string) => (id === 'rev_123' ? mockReviewItem : null),
    approveReviewItem: async (id: string) => {
      if (id !== 'rev_123') throw new Error('Not found');
      return {
        ...mockReviewItem,
        status: 'APPROVED' as const,
        approvedAt: new Date('2026-09-14T12:05:00Z'),
      };
    },
    rejectReviewItem: async (id: string) => {
      if (id !== 'rev_123') throw new Error('Not found');
      return {
        ...mockReviewItem,
        status: 'REJECTED' as const,
        rejectedAt: new Date('2026-09-14T12:05:00Z'),
      };
    },
  } as unknown as ReviewService;

  const mockPlanExecutor = {
    executeReviewItem: async (id: string) => {
      if (id !== 'rev_123') throw new Error('Not found');
      return {
        plan: {
          id: 'plan_123',
          mediaItemId: 'movie_123',
          profile: 'jellyfin',
          destinationRoot: '/movies',
          status: 'APPLIED' as const,
          operations: [],
          createdAt: new Date(),
          appliedAt: new Date(),
        } as OperationPlanDto,
        reviewItem: {
          ...mockReviewItem,
          status: 'APPLIED' as const,
        },
        executedOperations: 2,
      };
    },
  } as unknown as PlanExecutor;

  const mockServices: CliServices = {
    reviewService: mockReviewService,
    planExecutor: mockPlanExecutor,
  };

  it('handles "medialoom review list" human readable and --json', async () => {
    let stdout = '';
    const code = await runCli(
      ['review', 'list'],
      {
        stdout: {
          write: (c) => {
            stdout += c;
          },
        },
        stderr: {
          write: () => {},
        },
      },
      mockServices,
    );

    expect(code).toBe(ExitCode.SUCCESS);
    expect(stdout).toContain('Review Queue');
    expect(stdout).toContain('rev_123');
    expect(stdout).toContain('PENDING');
    expect(stdout).toContain('Blade Runner');

    let jsonStdout = '';
    const jsonCode = await runCli(
      ['review', 'list', '--json'],
      {
        stdout: {
          write: (c) => {
            jsonStdout += c;
          },
        },
        stderr: { write: () => {} },
      },
      mockServices,
    );

    expect(jsonCode).toBe(ExitCode.SUCCESS);
    const parsed = JSON.parse(jsonStdout);
    expect(parsed.status).toBe('success');
    expect(parsed.data.items).toHaveLength(1);
    expect(parsed.data.items[0].id).toBe('rev_123');
  });

  it('handles "medialoom review show <id>" human readable and --json', async () => {
    let stdout = '';
    const code = await runCli(
      ['review', 'show', 'rev_123'],
      {
        stdout: {
          write: (c) => {
            stdout += c;
          },
        },
        stderr: { write: () => {} },
      },
      mockServices,
    );

    expect(code).toBe(ExitCode.SUCCESS);
    expect(stdout).toContain('Review Queue Item: rev_123');
    expect(stdout).toContain('Blade Runner');
    expect(stdout).toContain('Summary:');
    expect(stdout).toContain('Files to Move');
    expect(stdout).toContain('Files to Write');

    let jsonStdout = '';
    const jsonCode = await runCli(
      ['review', 'show', 'rev_123', '--json'],
      {
        stdout: {
          write: (c) => {
            jsonStdout += c;
          },
        },
        stderr: { write: () => {} },
      },
      mockServices,
    );

    expect(jsonCode).toBe(ExitCode.SUCCESS);
    const parsed = JSON.parse(jsonStdout);
    expect(parsed.status).toBe('success');
    expect(parsed.data.item.id).toBe('rev_123');
    expect(parsed.data.item.details.affectedMovie.title).toBe('Blade Runner');
  });

  it('handles "medialoom review approve <id>" human readable and --json', async () => {
    let stdout = '';
    const code = await runCli(
      ['review', 'approve', 'rev_123'],
      {
        stdout: {
          write: (c) => {
            stdout += c;
          },
        },
        stderr: { write: () => {} },
      },
      mockServices,
    );

    expect(code).toBe(ExitCode.SUCCESS);
    expect(stdout).toContain('approved successfully');

    let jsonStdout = '';
    const jsonCode = await runCli(
      ['review', 'approve', 'rev_123', '--json'],
      {
        stdout: {
          write: (c) => {
            jsonStdout += c;
          },
        },
        stderr: { write: () => {} },
      },
      mockServices,
    );

    expect(jsonCode).toBe(ExitCode.SUCCESS);
    const parsed = JSON.parse(jsonStdout);
    expect(parsed.status).toBe('success');
    expect(parsed.data.action).toBe('APPROVED');
    expect(parsed.data.item.status).toBe('APPROVED');
  });

  it('handles "medialoom review reject <id>" human readable and --json', async () => {
    let stdout = '';
    const code = await runCli(
      ['review', 'reject', 'rev_123'],
      {
        stdout: {
          write: (c) => {
            stdout += c;
          },
        },
        stderr: { write: () => {} },
      },
      mockServices,
    );

    expect(code).toBe(ExitCode.SUCCESS);
    expect(stdout).toContain('rejected');
    expect(stdout).toContain('untouched');

    let jsonStdout = '';
    const jsonCode = await runCli(
      ['review', 'reject', 'rev_123', '--json'],
      {
        stdout: {
          write: (c) => {
            jsonStdout += c;
          },
        },
        stderr: { write: () => {} },
      },
      mockServices,
    );

    expect(jsonCode).toBe(ExitCode.SUCCESS);
    const parsed = JSON.parse(jsonStdout);
    expect(parsed.status).toBe('success');
    expect(parsed.data.action).toBe('REJECTED');
    expect(parsed.data.item.status).toBe('REJECTED');
  });

  it('handles "medialoom review apply <id>" human readable and --json', async () => {
    let stdout = '';
    const code = await runCli(
      ['review', 'apply', 'rev_123'],
      {
        stdout: {
          write: (c) => {
            stdout += c;
          },
        },
        stderr: { write: () => {} },
      },
      mockServices,
    );

    expect(code).toBe(ExitCode.SUCCESS);
    expect(stdout).toContain('applied successfully');

    let jsonStdout = '';
    const jsonCode = await runCli(
      ['review', 'apply', 'rev_123', '--json'],
      {
        stdout: {
          write: (c) => {
            jsonStdout += c;
          },
        },
        stderr: { write: () => {} },
      },
      mockServices,
    );

    expect(jsonCode).toBe(ExitCode.SUCCESS);
    const parsed = JSON.parse(jsonStdout);
    expect(parsed.status).toBe('success');
    expect(parsed.data.plan.status).toBe('APPLIED');
  });
});
