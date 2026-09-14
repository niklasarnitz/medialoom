import { describe, expect, it } from 'bun:test';
import type { MovieMetadataCandidate, MovieSearchQuery } from '@medialoom/contracts';
import type { InventoryRepository, MovieWithHierarchy, SettingsRepository } from '@medialoom/db';
import type { MovieMetadataProvider } from '@medialoom/providers';
import { MetadataService } from '../src';

describe('MetadataService', () => {
  const mockCandidates: MovieMetadataCandidate[] = [
    {
      provider: 'tmdb',
      providerId: '603',
      title: 'The Matrix',
      year: 1999,
      tmdbId: 603,
      overview: 'A hacker learns the truth...',
      posterPath: '/path.jpg',
      posterUrl: 'https://image.tmdb.org/t/p/w500/path.jpg',
    },
  ];

  const mockProvider: MovieMetadataProvider = {
    name: 'tmdb',
    searchMovies: async (query: MovieSearchQuery) => {
      if (query.query === 'The Matrix') {
        return mockCandidates;
      }
      return [];
    },
    getMovie: async (id: string | number) => {
      if (String(id) === '603') {
        return mockCandidates[0];
      }
      return null;
    },
  };

  const mockMovie: MovieWithHierarchy = {
    id: 'test_movie_id_1',
    title: 'The Matrix',
    originalTitle: 'The Matrix',
    year: 1999,
    runtimeMinutes: 136,
    overview: 'Overview',
    status: 'UNMATCHED',
    matchConfidence: null,
    tmdbId: null,
    imdbId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    editions: [],
  };

  const mockInventoryRepo = {
    getMovie: async (id: string) => {
      if (id === 'test_movie_id_1') return mockMovie;
      return null;
    },
  } as unknown as InventoryRepository;

  const mockSettingsRepo = {
    getTmdbApiKey: async () => 'mock_api_key',
    setTmdbApiKey: async () => {},
  } as unknown as SettingsRepository;

  it('retrieves candidates for an existing inventory item', async () => {
    const service = new MetadataService(mockProvider, mockInventoryRepo, mockSettingsRepo);
    const result = await service.getCandidatesForItem('test_movie_id_1');

    expect(result.item.id).toBe('test_movie_id_1');
    expect(result.query).toBe('The Matrix');
    expect(result.year).toBe(1999);
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].tmdbId).toBe(603);
  });

  it('throws an error when item is not found in inventory', async () => {
    const service = new MetadataService(mockProvider, mockInventoryRepo, mockSettingsRepo);
    expect(service.getCandidatesForItem('non_existent')).rejects.toThrow(
      'MediaItem "non_existent" not found',
    );
  });

  it('searches candidates directly via searchMovies', async () => {
    const service = new MetadataService(mockProvider, mockInventoryRepo, mockSettingsRepo);
    const candidates = await service.searchMovies({ query: 'The Matrix', year: 1999 });
    expect(candidates.length).toBe(1);
    expect(candidates[0].tmdbId).toBe(603);
  });

  it('retrieves movie details via getMovie', async () => {
    const service = new MetadataService(mockProvider, mockInventoryRepo, mockSettingsRepo);
    const movie = await service.getMovie(603);
    expect(movie?.title).toBe('The Matrix');
  });
});
