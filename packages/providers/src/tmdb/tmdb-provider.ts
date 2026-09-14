import {
  type MovieMetadataCandidate,
  type MovieSearchQuery,
  movieMetadataCandidateSchema,
  movieSearchQuerySchema,
} from '@medialoom/contracts';
import type { MovieMetadataProvider } from '../types';
import {
  ProviderAuthenticationError,
  ProviderConfigurationError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderResponseError,
} from './tmdb-errors';
import { tmdbMovieDetailsResponseSchema, tmdbMovieSearchResponseSchema } from './tmdb-schemas';

export type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface TmdbMovieProviderOptions {
  apiKey?: string;
  getApiKey?: () => Promise<string | null> | string | null;
  baseUrl?: string;
  imageBaseUrl?: string;
  fetchFn?: FetchFunction;
}

export class TmdbMovieProvider implements MovieMetadataProvider {
  readonly name = 'tmdb';
  private static readonly DEFAULT_BASE_URL = 'https://api.themoviedb.org/3';
  private static readonly DEFAULT_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

  private explicitApiKey?: string;
  private getApiKeyFn?: () => Promise<string | null> | string | null;
  private baseUrl: string;
  private imageBaseUrl: string;
  private fetchFn: FetchFunction;

  constructor(options: TmdbMovieProviderOptions = {}) {
    this.explicitApiKey = options.apiKey;
    this.getApiKeyFn = options.getApiKey;
    this.baseUrl = (options.baseUrl ?? TmdbMovieProvider.DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.imageBaseUrl = (options.imageBaseUrl ?? TmdbMovieProvider.DEFAULT_IMAGE_BASE_URL).replace(
      /\/+$/,
      '',
    );
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  private async resolveApiKey(): Promise<string> {
    if (this.explicitApiKey && this.explicitApiKey.trim().length > 0) {
      return this.explicitApiKey.trim();
    }
    if (this.getApiKeyFn) {
      const key = await this.getApiKeyFn();
      if (key && key.trim().length > 0) {
        return key.trim();
      }
    }
    throw new ProviderConfigurationError(
      'TMDb API key is not configured. Configure it via CLI ("medialoom config set tmdb_api_key <key>") or in the Web UI Settings.',
      this.name,
    );
  }

  private parseReleaseYear(releaseDate?: string | null): number | null {
    if (!releaseDate) return null;
    const match = releaseDate.match(/^(\d{4})/);
    const yearStr = match?.[1];
    return yearStr ? Number.parseInt(yearStr, 10) : null;
  }

  private buildPosterUrl(posterPath?: string | null): string | null {
    if (!posterPath || posterPath.trim().length === 0) return null;
    const cleanPath = posterPath.startsWith('/') ? posterPath : `/${posterPath}`;
    return `${this.imageBaseUrl}${cleanPath}`;
  }

  private async request(
    endpoint: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<unknown> {
    const apiKey = await this.resolveApiKey();

    const url = new URL(`${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }

    // Support both 32-char hex API keys (v3) and JWT Read Access Tokens (v4)
    const isV3Key = /^[0-9a-f]{32}$/i.test(apiKey);
    if (isV3Key) {
      url.searchParams.set('api_key', apiKey);
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };

    let response: Response;
    try {
      response = await this.fetchFn(url.toString(), {
        method: 'GET',
        headers,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderNetworkError(
        `Network error communicating with TMDb: ${message}`,
        err,
        this.name,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderAuthenticationError(
        'TMDb authentication failed: Invalid or expired API key.',
        this.name,
      );
    }

    if (response.status === 404) {
      return null;
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfter = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined;
      throw new ProviderRateLimitError('TMDb rate limit exceeded.', retryAfter, this.name);
    }

    if (!response.ok) {
      throw new ProviderResponseError(
        `TMDb HTTP error: status ${response.status} ${response.statusText}`,
        response.status,
        undefined,
        this.name,
      );
    }

    try {
      const json: unknown = await response.json();
      return json;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ProviderResponseError(
        `Failed to parse TMDb JSON response: ${message}`,
        response.status,
        undefined,
        this.name,
      );
    }
  }

  async searchMovies(queryInput: MovieSearchQuery): Promise<MovieMetadataCandidate[]> {
    const query = movieSearchQuerySchema.parse(queryInput);

    const params: Record<string, string | number | undefined> = {
      query: query.query,
      include_adult: 'false',
    };
    if (query.year) {
      params.year = query.year;
      params.primary_release_year = query.year;
    }
    if (query.language) {
      params.language = query.language;
    }

    const rawData = await this.request('/search/movie', params);
    if (!rawData) {
      return [];
    }

    const parsedResult = tmdbMovieSearchResponseSchema.safeParse(rawData);
    if (!parsedResult.success) {
      throw new ProviderResponseError(
        `Malformed TMDb search response: ${parsedResult.error.message}`,
        200,
        JSON.stringify(rawData).slice(0, 200),
        this.name,
      );
    }

    return parsedResult.data.results.map((item) => {
      const year = this.parseReleaseYear(item.release_date);
      const posterUrl = this.buildPosterUrl(item.poster_path);

      return movieMetadataCandidateSchema.parse({
        provider: this.name,
        providerId: String(item.id),
        title: item.title,
        originalTitle: item.original_title ?? null,
        year,
        releaseDate: item.release_date ?? null,
        runtimeMinutes: null,
        overview: item.overview ?? null,
        posterPath: item.poster_path ?? null,
        posterUrl,
        tmdbId: item.id,
        imdbId: null,
        rawPayload: item as unknown as Record<string, unknown>,
      });
    });
  }

  async getMovie(providerId: string | number): Promise<MovieMetadataCandidate | null> {
    const idStr = String(providerId).trim();
    if (!idStr) return null;

    const rawData = await this.request(`/movie/${encodeURIComponent(idStr)}`, {
      append_to_response: 'external_ids',
    });

    if (!rawData) {
      return null;
    }

    const parsedResult = tmdbMovieDetailsResponseSchema.safeParse(rawData);
    if (!parsedResult.success) {
      throw new ProviderResponseError(
        `Malformed TMDb movie details response: ${parsedResult.error.message}`,
        200,
        JSON.stringify(rawData).slice(0, 200),
        this.name,
      );
    }

    const item = parsedResult.data;
    const year = this.parseReleaseYear(item.release_date);
    const posterUrl = this.buildPosterUrl(item.poster_path);
    const imdbId = item.imdb_id || item.external_ids?.imdb_id || null;

    return movieMetadataCandidateSchema.parse({
      provider: this.name,
      providerId: String(item.id),
      title: item.title,
      originalTitle: item.original_title ?? null,
      year,
      releaseDate: item.release_date ?? null,
      runtimeMinutes: item.runtime && item.runtime > 0 ? item.runtime : null,
      overview: item.overview ?? null,
      posterPath: item.poster_path ?? null,
      posterUrl,
      tmdbId: item.id,
      imdbId,
      rawPayload: item as unknown as Record<string, unknown>,
    });
  }
}
