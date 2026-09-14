import { defaultInventoryService, ItemNotFoundError } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../../../api-utils';

export const Route = createFileRoute('/api/v1/items/$id/')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const item = await defaultInventoryService.getItem(params.id);
          if (!item) {
            throw new ItemNotFoundError(params.id);
          }
          return jsonSuccess({ item });
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
