import { DomainError, defaultPlanService } from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../../api-utils';

export const Route = createFileRoute('/api/v1/plans/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const plan = await defaultPlanService.getPlan(params.id);
          if (!plan) {
            throw new DomainError(`OperationPlan "${params.id}" not found.`, {
              code: 'PLAN_NOT_FOUND',
              statusCode: 404,
              details: { planId: params.id },
            });
          }
          return jsonSuccess({ plan });
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
