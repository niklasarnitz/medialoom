import { defaultReviewService } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../../../api-utils';

export const Route = createFileRoute('/api/v1/review/$id/approve')({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          const updated = await defaultReviewService.approveReviewItem(params.id);
          return jsonSuccess({
            item: updated,
            action: 'APPROVED',
            message: `Review item ${params.id} approved successfully.`,
          });
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
