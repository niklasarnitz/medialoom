import {
  defaultMetadataService,
  defaultMovieMatcher,
  extractLocalMovieMetadata,
} from '@medialoom/core';
import { createFileRoute } from '@tanstack/react-router';
import { jsonError, jsonSuccess } from '../../../../../api-utils';

export const Route = createFileRoute('/api/v1/items/$id/candidates')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const result = await defaultMetadataService.getCandidatesForItem(params.id);
          const localMetadata = extractLocalMovieMetadata(result.item);
          const evaluation = defaultMovieMatcher.evaluateCandidates(
            localMetadata,
            result.candidates,
          );

          return jsonSuccess({
            itemId: result.item.id,
            query: result.query,
            year: result.year,
            decision: evaluation.decision,
            candidates: result.candidates,
            evaluations: evaluation.evaluations,
          });
        } catch (err) {
          return jsonError(err);
        }
      },
    },
  },
});
