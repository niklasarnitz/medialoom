import { applyReviewRequestSchema } from '@medialoom/contracts';
import { defaultPlanExecutor } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../../../api-utils';

export const Route = createFileRoute('/api/v1/review/$id/apply')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          let dryRun = false;
          const url = new URL(request.url);
          const dryRunParam = url.searchParams.get('dryRun');
          if (dryRunParam === 'true' || dryRunParam === '1') {
            dryRun = true;
          }

          if (request.headers.get('content-type')?.includes('application/json')) {
            try {
              const body = await request.json();
              const parsedBody = applyReviewRequestSchema.safeParse(body);
              if (parsedBody.success && parsedBody.data.dryRun !== undefined) {
                dryRun = parsedBody.data.dryRun;
              }
            } catch {
              // Non-JSON or empty body is acceptable; fallback to query param or default
            }
          }

          const result = await defaultPlanExecutor.applyApprovedReviewItem(params.id, { dryRun });
          return jsonSuccess(result);
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
