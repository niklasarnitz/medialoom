import { DomainError, defaultReviewService } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../../../api-utils';

export const Route = createFileRoute('/api/v1/review/$id/')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const item = await defaultReviewService.getReviewItem(params.id);
          if (!item) {
            throw new DomainError(`ReviewQueueItem "${params.id}" not found.`, {
              code: 'REVIEW_NOT_FOUND',
              statusCode: 404,
              details: { reviewId: params.id },
            });
          }
          return jsonSuccess({ item });
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
