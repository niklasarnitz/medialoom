import { listReviewQuerySchema } from '@medialoom/contracts';
import { defaultReviewService } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../../api-utils';

export const Route = createFileRoute('/api/v1/review/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const queryParams = {
            mediaItemId: url.searchParams.get('mediaItemId') || undefined,
            operationPlanId: url.searchParams.get('operationPlanId') || undefined,
            status: url.searchParams.get('status') || undefined,
            type: url.searchParams.get('type') || undefined,
            limit: url.searchParams.get('limit') || undefined,
            offset: url.searchParams.get('offset') || undefined,
          };
          const validated = listReviewQuerySchema.parse(queryParams);
          const items = await defaultReviewService.listReviewItems(validated);
          return jsonSuccess({ items });
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
