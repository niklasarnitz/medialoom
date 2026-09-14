import { describe, expect, it } from 'bun:test';
import {
  mkdirOperationSchema,
  moveOperationSchema,
  operationPlanDtoSchema,
  operationSchema,
  planStatusSchema,
  planValidationResultSchema,
  writeTextOperationSchema,
} from '../src';

describe('Plan Domain Contracts', () => {
  describe('Discriminated Operations', () => {
    it('validates mkdir operation', () => {
      const op = {
        type: 'mkdir' as const,
        path: '/movies/The Matrix (1999) [tmdbid-603]',
      };
      const parsed = mkdirOperationSchema.parse(op);
      expect(parsed.type).toBe('mkdir');
      expect(parsed.path).toBe('/movies/The Matrix (1999) [tmdbid-603]');

      const genericParsed = operationSchema.parse(op);
      expect(genericParsed.type).toBe('mkdir');
    });

    it('validates move operation', () => {
      const op = {
        type: 'move' as const,
        source: '/incoming/The.Matrix.1999.mkv',
        destination: '/movies/The Matrix (1999) [tmdbid-603]/The Matrix (1999) [tmdbid-603].mkv',
      };
      const parsed = moveOperationSchema.parse(op);
      expect(parsed.type).toBe('move');
      expect(parsed.source).toBe('/incoming/The.Matrix.1999.mkv');
      expect(parsed.destination).toBe(
        '/movies/The Matrix (1999) [tmdbid-603]/The Matrix (1999) [tmdbid-603].mkv',
      );

      const genericParsed = operationSchema.parse(op);
      expect(genericParsed.type).toBe('move');
    });

    it('validates writeText operation', () => {
      const op = {
        type: 'writeText' as const,
        path: '/movies/The Matrix (1999) [tmdbid-603]/movie.nfo',
        content: '<?xml version="1.0" encoding="UTF-8"?><movie><title>The Matrix</title></movie>',
      };
      const parsed = writeTextOperationSchema.parse(op);
      expect(parsed.type).toBe('writeText');
      expect(parsed.path).toBe('/movies/The Matrix (1999) [tmdbid-603]/movie.nfo');
      expect(parsed.content).toContain('<title>The Matrix</title>');

      const genericParsed = operationSchema.parse(op);
      expect(genericParsed.type).toBe('writeText');
    });

    it('rejects invalid operation types', () => {
      expect(() =>
        operationSchema.parse({
          type: 'delete',
          path: '/movies/test',
        }),
      ).toThrow();
    });
  });

  describe('Validation and Plan DTO', () => {
    it('validates plan status enum', () => {
      expect(planStatusSchema.parse('PENDING')).toBe('PENDING');
      expect(planStatusSchema.parse('VALIDATED')).toBe('VALIDATED');
      expect(planStatusSchema.parse('APPLIED')).toBe('APPLIED');
      expect(planStatusSchema.parse('FAILED')).toBe('FAILED');
      expect(() => planStatusSchema.parse('UNKNOWN')).toThrow();
    });

    it('validates plan validation results', () => {
      const val = {
        valid: false,
        issues: [
          {
            severity: 'error' as const,
            code: 'SOURCE_NOT_FOUND',
            message: 'Source file does not exist',
            operationIndex: 1,
            path: '/incoming/missing.mkv',
          },
        ],
      };
      const parsed = planValidationResultSchema.parse(val);
      expect(parsed.valid).toBe(false);
      expect(parsed.issues).toHaveLength(1);
      expect(parsed.issues[0]?.code).toBe('SOURCE_NOT_FOUND');
    });

    it('validates complete OperationPlanDto', () => {
      const now = new Date();
      const plan = {
        id: 'plan_123',
        mediaItemId: 'movie_123',
        profile: 'jellyfin',
        destinationRoot: '/movies',
        status: 'VALIDATED' as const,
        operations: [
          {
            type: 'mkdir' as const,
            path: '/movies/The Matrix (1999) [tmdbid-603]',
          },
          {
            type: 'move' as const,
            source: '/incoming/The.Matrix.1999.mkv',
            destination:
              '/movies/The Matrix (1999) [tmdbid-603]/The Matrix (1999) [tmdbid-603].mkv',
          },
          {
            type: 'writeText' as const,
            path: '/movies/The Matrix (1999) [tmdbid-603]/movie.nfo',
            content: '<movie></movie>',
          },
        ],
        validation: {
          valid: true,
          issues: [],
        },
        failureReason: null,
        createdAt: now,
        validatedAt: now,
        appliedAt: null,
      };

      const parsed = operationPlanDtoSchema.parse(plan);
      expect(parsed.id).toBe('plan_123');
      expect(parsed.status).toBe('VALIDATED');
      expect(parsed.operations).toHaveLength(3);
      expect(parsed.validation?.valid).toBe(true);
    });
  });
});
