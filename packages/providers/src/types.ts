import type { MovieMetadataCandidate, MovieSearchQuery } from '@medialoom/contracts';

export interface MovieMetadataProvider {
  readonly name: string;
  searchMovies(query: MovieSearchQuery): Promise<MovieMetadataCandidate[]>;
  getMovie(providerId: string | number): Promise<MovieMetadataCandidate | null>;
}
