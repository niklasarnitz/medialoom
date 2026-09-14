import { createPlanRequestSchema, listPlansQuerySchema } from '@medialoom/contracts';
import { defaultPlanService } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../../api-utils';

export const Route = createFileRoute('/api/v1/plans/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const queryParams = {
            mediaItemId: url.searchParams.get('mediaItemId') || undefined,
            status: url.searchParams.get('status') || undefined,
            limit: url.searchParams.get('limit') || undefined,
            offset: url.searchParams.get('offset') || undefined,
          };
          const validated = listPlansQuerySchema.parse(queryParams);
          const plans = await defaultPlanService.listPlans(validated);
          return jsonSuccess({ plans });
        } catch (err) {
          return jsonError(err);
        }
      },
      POST: async ({ request }) => {
        try {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return jsonError(new Error('Invalid JSON request body'));
          }

          const parsed = createPlanRequestSchema.parse(body);
          const plan = await defaultPlanService.createPlan(parsed);
          return jsonSuccess({ plan }, 201);
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
