import type { MovieLayoutPlan } from '@medialoom/contracts';
import type { MovieWithHierarchy } from '@medialoom/db';

export interface MovieProfileInput {
  movie: MovieWithHierarchy;
  destinationRoot: string;
  editionId?: string;
  versionId?: string;
  sourcePathOverride?: string;
}

export interface MovieOutputProfile {
  readonly name: string;
  generateMovieLayout(input: MovieProfileInput): MovieLayoutPlan;
}
