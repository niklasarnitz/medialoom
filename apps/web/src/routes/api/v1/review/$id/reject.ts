import { defaultReviewService } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../../../api-utils';

export const Route = createFileRoute('/api/v1/review/$id/reject')({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          const updated = await defaultReviewService.rejectReviewItem(params.id);
          return jsonSuccess({
            item: updated,
            action: 'REJECTED',
            message: `Review item ${params.id} rejected.`,
          });
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
