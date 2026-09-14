import { describe, expect, it } from 'bun:test';
import {
  ProviderAuthenticationError,
  ProviderConfigurationError,
  ProviderNetworkError,
  ProviderRateLimitError,
  ProviderResponseError,
  TmdbMovieProvider,
} from '../src';

// Realistic TMDb fixtures
const mockTheMatrixSearchResult = {
  page: 1,
  results: [
    {
      adult: false,
      backdrop_path: '/7u3BgYB0fNcrmNVteAkfd723urW.jpg',
      genre_ids: [28, 878],
      id: 603,
      original_language: 'en',
      original_title: 'The Matrix',
      overview:
        'Set in the 22nd century, The Matrix tells the story of a computer hacker who learns from mysterious rebels about the true nature of his reality.',
      popularity: 114.288,
      poster_path: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
      release_date: '1999-03-30',
      title: 'The Matrix',
      video: false,
      vote_average: 8.2,
      vote_count: 25600,
    },
  ],
  total_pages: 1,
  total_results: 1,
};

const mockTheMatrixDetailsResult = {
  adult: false,
  backdrop_path: '/7u3BgYB0fNcrmNVteAkfd723urW.jpg',
  budget: 63000000,
  genres: [
    { id: 28, name: 'Action' },
    { id: 878, name: 'Science Fiction' },
  ],
  id: 603,
  imdb_id: 'tt0133093',
  original_language: 'en',
  original_title: 'The Matrix',
  overview: 'Set in the 22nd century...',
  popularity: 114.288,
  poster_path: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
  release_date: '1999-03-30',
  revenue: 463517383,
  runtime: 136,
  status: 'Released',
  title: 'The Matrix',
  vote_average: 8.2,
  vote_count: 25600,
};

describe('TmdbMovieProvider', () => {
  it('throws ProviderConfigurationError when API key is missing', async () => {
    const provider = new TmdbMovieProvider();
    expect(provider.searchMovies({ query: 'Matrix' })).rejects.toThrow(
      ProviderConfigurationError,
    );
  });

  it('performs successful title and year search with mocked network call', async () => {
    let capturedUrl = '';
    let capturedHeaders: HeadersInit | undefined;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify(mockTheMatrixSearchResult), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const provider = new TmdbMovieProvider({
      apiKey: 'test_token_12345',
      fetchFn: mockFetch as typeof fetch,
    });

    const results = await provider.searchMovies({
      query: 'The Matrix',
      year: 1999,
    });

    expect(results.length).toBe(1);
    const candidate = results[0];
    expect(candidate.provider).toBe('tmdb');
    expect(candidate.providerId).toBe('603');
    expect(candidate.tmdbId).toBe(603);
    expect(candidate.title).toBe('The Matrix');
    expect(candidate.originalTitle).toBe('The Matrix');
    expect(candidate.year).toBe(1999);
    expect(candidate.releaseDate).toBe('1999-03-30');
    expect(candidate.posterPath).toBe('/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg');
    expect(candidate.posterUrl).toBe(
      'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
    );
    expect(candidate.overview).toContain('Set in the 22nd century');
    expect(candidate.rawPayload).toBeDefined();

    expect(capturedUrl).toContain('/search/movie?');
    expect(capturedUrl).toContain('query=The+Matrix');
    expect(capturedUrl).toContain('year=1999');
    expect(capturedHeaders).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer test_token_12345',
    });
  });

  it('handles empty results properly', async () => {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          page: 1,
          results: [],
          total_pages: 0,
          total_results: 0,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    };

    const provider = new TmdbMovieProvider({
      apiKey: 'test_token',
      fetchFn: mockFetch as typeof fetch,
    });

    const results = await provider.searchMovies({ query: 'NonExistentMovie987654321' });
    expect(results).toEqual([]);
  });

  it('handles authentication / provider failure (401)', async () => {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          status_code: 7,
          status_message: 'Invalid API key: You must be granted a valid key.',
          success: false,
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    };

    const provider = new TmdbMovieProvider({
      apiKey: 'invalid_token',
      fetchFn: mockFetch as typeof fetch,
    });

    expect(provider.searchMovies({ query: 'Matrix' })).rejects.toThrow(
      ProviderAuthenticationError,
    );
  });

  it('handles rate limiting (429) with retry-after header', async () => {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          status_code: 25,
          status_message: 'Your request count (#) is over the allowed limit of (40).',
          success: false,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'retry-after': '5',
          },
        },
      );
    };

    const provider = new TmdbMovieProvider({
      apiKey: 'valid_token',
      fetchFn: mockFetch as typeof fetch,
    });

    try {
      await provider.searchMovies({ query: 'Matrix' });
      expect(true).toBe(false); // unreachable
    } catch (err) {
      expect(err instanceof ProviderRateLimitError).toBe(true);
      if (err instanceof ProviderRateLimitError) {
        expect(err.statusCode).toBe(429);
        expect(err.retryAfterSeconds).toBe(5);
      }
    }
  });

  it('handles malformed provider payload', async () => {
    // 1. Invalid JSON string
    const mockFetchMalformedJson = async () => {
      return new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const provider1 = new TmdbMovieProvider({
      apiKey: 'token',
      fetchFn: mockFetchMalformedJson as typeof fetch,
    });
    expect(provider1.searchMovies({ query: 'Matrix' })).rejects.toThrow(
      ProviderResponseError,
    );

    // 2. JSON that does not adhere to boundary schema (missing results array)
    const mockFetchInvalidSchema = async () => {
      return new Response(JSON.stringify({ unknown_field: 123 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const provider2 = new TmdbMovieProvider({
      apiKey: 'token',
      fetchFn: mockFetchInvalidSchema as typeof fetch,
    });
    expect(provider2.searchMovies({ query: 'Matrix' })).rejects.toThrow(
      ProviderResponseError,
    );
  });

  it('handles optional and missing fields gracefully during normalization', async () => {
    const mockFetchPartial = async () => {
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 99999,
              title: 'Obscure Indie Movie',
              // No original_title
              // No release_date
              // No overview
              // No poster_path
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    };

    const provider = new TmdbMovieProvider({
      apiKey: 'token',
      fetchFn: mockFetchPartial as typeof fetch,
    });

    const results = await provider.searchMovies({ query: 'Indie' });
    expect(results.length).toBe(1);
    const item = results[0];
    expect(item.id).toBeUndefined(); // domain id is separate
    expect(item.tmdbId).toBe(99999);
    expect(item.title).toBe('Obscure Indie Movie');
    expect(item.originalTitle).toBeNull();
    expect(item.year).toBeNull();
    expect(item.releaseDate).toBeNull();
    expect(item.overview).toBeNull();
    expect(item.posterPath).toBeNull();
    expect(item.posterUrl).toBeNull();
    expect(item.runtimeMinutes).toBeNull();
    expect(item.imdbId).toBeNull();
  });

  it('maps network errors to ProviderNetworkError', async () => {
    const mockFetchNetworkFailure = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:443');
    };

    const provider = new TmdbMovieProvider({
      apiKey: 'token',
      fetchFn: mockFetchNetworkFailure as typeof fetch,
    });

    expect(provider.searchMovies({ query: 'Matrix' })).rejects.toThrow(
      ProviderNetworkError,
    );
  });

  it('retrieves detailed movie metadata with runtime and imdbId via getMovie', async () => {
    const mockFetch = async () => {
      return new Response(JSON.stringify(mockTheMatrixDetailsResult), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const provider = new TmdbMovieProvider({
      apiKey: 'token',
      fetchFn: mockFetch as typeof fetch,
    });

    const movie = await provider.getMovie(603);
    expect(movie).not.toBeNull();
    expect(movie?.tmdbId).toBe(603);
    expect(movie?.title).toBe('The Matrix');
    expect(movie?.year).toBe(1999);
    expect(movie?.runtimeMinutes).toBe(136);
    expect(movie?.imdbId).toBe('tt0133093');
  });

  it('returns null when getMovie receives 404', async () => {
    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          status_code: 34,
          status_message: 'The resource you requested could not be found.',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    };

    const provider = new TmdbMovieProvider({
      apiKey: 'token',
      fetchFn: mockFetch as typeof fetch,
    });

    const movie = await provider.getMovie(9999999);
    expect(movie).toBeNull();
  });

  it('resolves API key dynamically via getApiKey callback', async () => {
    let callCount = 0;
    const dynamicGetter = async () => {
      callCount++;
      return 'dynamic_key_from_db';
    };

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const authHeader = (init?.headers as Record<string, string>)?.Authorization;
      expect(authHeader).toBe('Bearer dynamic_key_from_db');
      return new Response(JSON.stringify(mockTheMatrixSearchResult), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const provider = new TmdbMovieProvider({
      getApiKey: dynamicGetter,
      fetchFn: mockFetch as typeof fetch,
    });

    const results = await provider.searchMovies({ query: 'Matrix' });
    expect(results.length).toBe(1);
    expect(callCount).toBe(1);
  });
});
