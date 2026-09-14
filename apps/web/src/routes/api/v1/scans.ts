import { createScanRequestSchema } from '@medialoom/contracts';
import { defaultInventoryService } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../api-utils';

export const Route = createFileRoute('/api/v1/scans')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return jsonError(new Error('Invalid JSON request body'));
          }

          const parsed = createScanRequestSchema.parse(body);
          const result = await defaultInventoryService.scan(parsed.path);
          return jsonSuccess(result, 201);
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
