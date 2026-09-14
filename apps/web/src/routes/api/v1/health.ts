import { defaultSystemService } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../api-utils';

export const Route = createFileRoute('/api/v1/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const health = await defaultSystemService.getHealth();
          return jsonSuccess(health);
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
