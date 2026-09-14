import { defaultPlanExecutor } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../../../api-utils';

export const Route = createFileRoute('/api/v1/review/$id/apply')({
  server: {
    handlers: {
      POST: async ({ params }) => {
        try {
          const result = await defaultPlanExecutor.executeReviewItem(params.id);
          return jsonSuccess({
            plan: result.plan,
            reviewItem: result.reviewItem,
            executedOperations: result.executedOperations,
          });
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
