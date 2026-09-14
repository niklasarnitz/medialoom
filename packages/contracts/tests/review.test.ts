import { describe, expect, it } from 'bun:test';
import {
  reviewItemDetailsSchema,
  reviewItemStatusSchema,
  reviewItemTypeSchema,
  reviewQueueItemDtoSchema,
} from '../src';

describe('Review Domain Contracts', () => {
  it('validates reviewItemTypeSchema and reviewItemStatusSchema', () => {
    expect(reviewItemTypeSchema.parse('FILESYSTEM_CHANGE')).toBe('FILESYSTEM_CHANGE');
    expect(reviewItemTypeSchema.parse('MATCH_REVIEW')).toBe('MATCH_REVIEW');
    expect(() => reviewItemTypeSchema.parse('INVALID_TYPE')).toThrow();

    expect(reviewItemStatusSchema.parse('PENDING')).toBe('PENDING');
    expect(reviewItemStatusSchema.parse('APPROVED')).toBe('APPROVED');
    expect(reviewItemStatusSchema.parse('REJECTED')).toBe('REJECTED');
    expect(reviewItemStatusSchema.parse('APPLIED')).toBe('APPLIED');
    expect(reviewItemStatusSchema.parse('FAILED')).toBe('FAILED');
    expect(() => reviewItemStatusSchema.parse('INVALID_STATUS')).toThrow();
  });

  it('validates structured reviewItemDetailsSchema', () => {
    const details = {
      affectedMovie: {
        id: 'movie_1',
        title: 'Blade Runner',
        year: 1982,
        status: 'MATCHED',
      },
      reason: 'Reorganize media files according to Jellyfin layout',
      destinationRoot: '/movies',
      directoriesToCreate: [{ path: '/movies/Blade Runner (1982) [tmdbid-78]' }],
      filesToMove: [
        {
          source: '/incoming/Blade.Runner.1982.Final.Cut.2160p.mkv',
          destination:
            '/movies/Blade Runner (1982) [tmdbid-78]/Blade Runner (1982) [tmdbid-78] - Final Cut - 2160p UHD BluRay.mkv',
          versionLabel: '2160p UHD BluRay',
          edition: 'Final Cut',
        },
      ],
      filesToWrite: [
        {
          path: '/movies/Blade Runner (1982) [tmdbid-78]/movie.nfo',
          filename: 'movie.nfo',
          type: 'nfo',
          sizeChars: 1200,
        },
      ],
      versionNamingChanges: ['Added version label: 2160p UHD BluRay'],
      validation: {
        valid: true,
        issues: [],
      },
      warnings: [],
      conflicts: [],
    };

    const parsed = reviewItemDetailsSchema.parse(details);
    expect(parsed.affectedMovie?.title).toBe('Blade Runner');
    expect(parsed.filesToMove).toHaveLength(1);
    expect(parsed.filesToWrite).toHaveLength(1);
    expect(parsed.directoriesToCreate).toHaveLength(1);
  });

  it('validates complete reviewQueueItemDtoSchema', () => {
    const now = new Date();
    const dto = {
      id: 'rev_123',
      type: 'FILESYSTEM_CHANGE' as const,
      status: 'PENDING' as const,
      mediaItemId: 'movie_1',
      operationPlanId: 'plan_1',
      title: 'Reorganize: Blade Runner (1982)',
      summary: 'Blade Runner (1982)\n1 file will be reorganized:\nMOVE ...',
      details: {
        affectedMovie: {
          id: 'movie_1',
          title: 'Blade Runner',
          year: 1982,
        },
        reason: 'Jellyfin layout reorganization',
        destinationRoot: '/movies',
        directoriesToCreate: [],
        filesToMove: [],
        filesToWrite: [],
        versionNamingChanges: [],
        warnings: [],
        conflicts: [],
      },
      createdAt: now,
      reviewedAt: null,
      approvedAt: null,
      rejectedAt: null,
    };

    const parsed = reviewQueueItemDtoSchema.parse(dto);
    expect(parsed.id).toBe('rev_123');
    expect(parsed.status).toBe('PENDING');
    expect(parsed.type).toBe('FILESYSTEM_CHANGE');
    expect(parsed.details?.affectedMovie?.title).toBe('Blade Runner');
  });
});
