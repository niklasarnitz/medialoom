import { describe, expect, it } from 'bun:test';
import type { MediaItem } from '@medialoom/contracts';
import { TmdbMovieProvider } from '../src';

describe('Stage 5 Acceptance Test: TMDb Metadata Provider', () => {
  it('for a MediaItem parsed as "The Matrix 1999", returns a normalized candidate representing "The Matrix 1999 TMDb 603" using realistic provider data', async () => {
    // 1. MediaItem parsed from filename/inventory as The Matrix 1999
    const mediaItem: Partial<MediaItem> = {
      id: 'movie_the_matrix_1999',
      title: 'The Matrix',
      year: 1999,
      status: 'UNMATCHED',
    };

    // 2. Realistic TMDb search response
    const realisticTmdbResponse = {
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
            'Set in the 22nd century, The Matrix tells the story of a computer hacker who learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.',
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

    const mockFetch = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/3/search/movie');
      expect(url.searchParams.get('query')).toBe('The Matrix');
      expect(url.searchParams.get('year')).toBe('1999');

      return new Response(JSON.stringify(realisticTmdbResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    // 3. Provider Adapter configured with realistic mock
    const provider = new TmdbMovieProvider({
      apiKey: 'mock_tmdb_token',
      fetchFn: mockFetch as typeof fetch,
    });

    // 4. Perform search using MediaItem properties
    const candidates = await provider.searchMovies({
      query: mediaItem.title ?? 'The Matrix',
      year: mediaItem.year ?? undefined,
    });

    // 5. Verify the normalized candidate
    expect(candidates.length).toBeGreaterThanOrEqual(1);

    const match = candidates.find((c) => c.tmdbId === 603);
    expect(match).toBeDefined();
    expect(match?.provider).toBe('tmdb');
    expect(match?.providerId).toBe('603');
    expect(match?.tmdbId).toBe(603);
    expect(match?.title).toBe('The Matrix');
    expect(match?.year).toBe(1999);
    expect(match?.releaseDate).toBe('1999-03-30');
    expect(match?.overview).toContain('Set in the 22nd century');
    expect(match?.posterPath).toBe('/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg');
    expect(match?.posterUrl).toBe(
      'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
    );
  });
});
