import { type ItemMatchResult, matchItemRequestSchema } from '@medialoom/contracts';
import { defaultMatchingService } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../../../api-utils';

export const Route = createFileRoute('/api/v1/items/$id/match')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          let body: unknown = {};
          try {
            const text = await request.text();
            if (text.trim().length > 0) {
              body = JSON.parse(text);
            }
          } catch {
            return jsonError(new Error('Invalid JSON request body'));
          }

          const parsed = matchItemRequestSchema.parse(body);
          const targetId = parsed?.id ?? parsed?.providerId;

          let result: ItemMatchResult;
          if (targetId !== undefined && targetId !== null) {
            result = await defaultMatchingService.manualMatch(params.id, {
              provider: parsed?.provider || 'tmdb',
              id: targetId,
            });
          } else {
            result = await defaultMatchingService.matchItem(params.id);
          }

          return jsonSuccess({
            itemId: result.itemId,
            decision: result.decision,
            score: result.score,
            components: result.components,
            matched: result.decision === 'AUTO_MATCH',
            isManual: result.isManual,
            candidate: result.selectedCandidate,
            evaluations: result.evaluations,
          });
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
