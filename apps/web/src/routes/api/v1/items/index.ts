import { listItemsQuerySchema } from '@medialoom/contracts';
import { defaultInventoryService } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../../api-utils';

export const Route = createFileRoute('/api/v1/items/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const queryParams = {
            query: url.searchParams.get('query') || undefined,
            status: url.searchParams.get('status') || undefined,
            limit: url.searchParams.get('limit') || undefined,
            offset: url.searchParams.get('offset') || undefined,
          };
          const validated = listItemsQuerySchema.parse(queryParams);
          const items = await defaultInventoryService.listItems(validated);
          return jsonSuccess({ items });
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
