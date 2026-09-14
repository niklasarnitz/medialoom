import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import type { MovieMetadataCandidate } from '@medialoom/contracts';
import { closeDatabaseConnection, getPrismaClient, InventoryRepository } from '@medialoom/db';
import type { MovieMetadataProvider } from '@medialoom/providers';
import { MatchingService } from '../src/matching/matching-service';
import { MetadataService } from '../src/metadata/metadata-service';

describe('MatchingService (Lifecycle & DB Association)', () => {
  let repo: InventoryRepository;

  const mockProviderCandidates: MovieMetadataCandidate[] = [
    {
      provider: 'tmdb',
      providerId: '603',
      title: 'The Matrix',
      originalTitle: 'The Matrix',
      year: 1999,
      releaseDate: '1999-03-30',
      runtimeMinutes: 136,
      overview: 'A computer hacker learns about reality.',
      posterPath: '/matrix.jpg',
      posterUrl: 'https://image.tmdb.org/t/p/w500/matrix.jpg',
      tmdbId: 603,
      imdbId: 'tt0133093',
    },
    {
      provider: 'tmdb',
      providerId: '604',
      title: 'The Matrix Reloaded',
      year: 2003,
      runtimeMinutes: 138,
      tmdbId: 604,
    },
    {
      provider: 'tmdb',
      providerId: '700',
      title: 'Inception',
      year: 2010,
      runtimeMinutes: 148,
      tmdbId: 700,
      imdbId: 'tt1375666',
    },
  ];

  const mockProvider: MovieMetadataProvider = {
    name: 'tmdb',
    searchMovies: async (query) => {
      const q = query.query.toLowerCase();
      if (q.includes('matrix')) {
        return mockProviderCandidates.filter((c) => c.title.toLowerCase().includes('matrix'));
      }
      if (q.includes('inception')) {
        return mockProviderCandidates.filter((c) => c.title.toLowerCase().includes('inception'));
      }
      return [];
    },
    getMovie: async (id) => {
      const found = mockProviderCandidates.find((c) => c.providerId === String(id));
      return found ?? null;
    },
  };

  beforeAll(() => {
    repo = new InventoryRepository(getPrismaClient());
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  beforeEach(async () => {
    const prisma = getPrismaClient();
    await prisma.movie.deleteMany({
      where: {
        OR: [
          { tmdbId: { in: [603, 604, 700, 800] } },
          { title: { contains: 'Matrix' } },
          { title: { contains: 'Inception' } },
          { title: { contains: 'Non Existent' } },
          { title: { contains: 'Misidentified' } },
        ],
      },
    });
  });

  it('performs AUTO_MATCH for high-confidence match, updates Movie and sets status MATCHED', async () => {
    // 1. Create an unmatched movie in inventory with an asset and technical metadata
    const movie = await repo.createMovie({
      title: 'The Matrix',
      year: 1999,
      status: 'UNMATCHED',
    });
    const edition = await repo.createEdition({ movieId: movie.id, name: 'Theatrical' });
    const version = await repo.createMediaVersion({ editionId: edition.id, name: '1080p' });
    const asset = await repo.createAsset({
      mediaVersionId: version.id,
      path: `/media/matrix-${Date.now()}.mkv`,
      sizeBytes: 8_000_000_000,
      mtime: new Date(),
    });
    await repo.setTechnicalMetadata({
      assetId: asset.id,
      container: 'matroska',
      durationSeconds: 8160, // 136 minutes
      videoCodec: 'h264',
    });

    const metadataService = new MetadataService(mockProvider, repo);
    const service = new MatchingService({
      metadataService,
      inventoryRepo: repo,
    });

    // 2. Run matchItem
    const result = await service.matchItem(movie.id);

    expect(result.decision).toBe('AUTO_MATCH');
    expect(result.score).toBeGreaterThanOrEqual(0.9);
    expect(result.selectedCandidate?.tmdbId).toBe(603);
    expect(result.components).toBeDefined();
    expect(result.components?.title).toBe(0.6);
    expect(result.components?.year).toBe(0.25);
    expect(result.components?.runtime).toBe(0.1);

    // 3. Verify Movie was updated in database
    const updated = await repo.getMovie(movie.id);
    expect(updated).not.toBeNull();
    expect(updated?.status).toBe('MATCHED');
    expect(updated?.tmdbId).toBe(603);
    expect(updated?.imdbId).toBe('tt0133093');
    expect(updated?.runtimeMinutes).toBe(136);
    expect(updated?.matchConfidence).toBe(result.score);
    expect(updated?.matchDetails).not.toBeNull();

    if (!updated?.matchDetails) throw new Error('Expected matchDetails to be present');
    const details = JSON.parse(updated.matchDetails);
    expect(details.score).toBe(result.score);
    expect(details.decision).toBe('AUTO_MATCH');
    expect(details.components.title).toBe(0.6);
  });

  it('handles existing Movie deduplication by re-associating editions when canonical TMDb ID exists', async () => {
    // Existing canonical movie in library
    const canonicalMovie = await repo.createMovie({
      title: 'Inception',
      year: 2010,
      tmdbId: 700,
      status: 'MATCHED',
    });
    await repo.createEdition({ movieId: canonicalMovie.id, name: 'Theatrical' });

    // Newly scanned second copy / edition
    const newScannedMovie = await repo.createMovie({
      title: 'Inception',
      year: 2010,
      status: 'UNMATCHED',
    });
    const secondEdition = await repo.createEdition({
      movieId: newScannedMovie.id,
      name: 'Extended Edition',
    });

    const metadataService = new MetadataService(mockProvider, repo);
    const service = new MatchingService({
      metadataService,
      inventoryRepo: repo,
    });

    const result = await service.matchItem(newScannedMovie.id);

    expect(result.decision).toBe('AUTO_MATCH');
    // Returned item ID should be the consolidated canonicalMovie.id
    expect(result.itemId).toBe(canonicalMovie.id);

    // Verify edition was moved to canonicalMovie
    const consolidated = await repo.getMovie(canonicalMovie.id);
    expect(consolidated?.editions).toHaveLength(2);
    expect(consolidated?.editions.some((e) => e.id === secondEdition.id)).toBe(true);

    // Verify old placeholder movie was deleted
    const deletedPlaceholder = await repo.getMovie(newScannedMovie.id);
    expect(deletedPlaceholder).toBeNull();
  });

  it('updates Movie with REVIEW_REQUIRED and does not associate tmdbId when match is ambiguous or medium-confidence', async () => {
    const movie = await repo.createMovie({
      title: 'The Matrix', // exact title (0.60), rank (0.05) = 0.65 -> REVIEW_REQUIRED
      status: 'UNMATCHED',
    });

    const metadataService = new MetadataService(mockProvider, repo);
    const service = new MatchingService({
      metadataService,
      inventoryRepo: repo,
    });

    const result = await service.matchItem(movie.id);

    expect(result.decision).toBe('REVIEW_REQUIRED');
    expect(result.selectedCandidate).toBeNull();

    const updated = await repo.getMovie(movie.id);
    expect(updated?.status).toBe('REVIEW_REQUIRED');
    expect(updated?.tmdbId).toBeNull();
    expect(updated?.matchConfidence).toBe(result.score);
  });

  it('handles UNMATCHED when no candidate meets threshold', async () => {
    const movie = await repo.createMovie({
      title: 'Completely Non Existent Movie 99999',
      status: 'UNMATCHED',
    });

    const metadataService = new MetadataService(mockProvider, repo);
    const service = new MatchingService({
      metadataService,
      inventoryRepo: repo,
    });

    const result = await service.matchItem(movie.id);

    expect(result.decision).toBe('UNMATCHED');
    expect(result.selectedCandidate).toBeNull();

    const updated = await repo.getMovie(movie.id);
    expect(updated?.status).toBe('UNMATCHED');
    expect(updated?.tmdbId).toBeNull();
  });

  it('supports manual match override by fetching canonical provider metadata and associating to Movie', async () => {
    const movie = await repo.createMovie({
      title: 'Misidentified File Name',
      year: 2000,
      status: 'UNMATCHED',
    });

    const metadataService = new MetadataService(mockProvider, repo);
    const service = new MatchingService({
      metadataService,
      inventoryRepo: repo,
    });

    const result = await service.manualMatch(movie.id, {
      provider: 'tmdb',
      id: '603',
    });

    expect(result.decision).toBe('AUTO_MATCH');
    expect(result.score).toBe(1.0);
    expect(result.isManual).toBe(true);
    expect(result.selectedCandidate?.tmdbId).toBe(603);
    expect(result.selectedCandidate?.title).toBe('The Matrix');

    const updated = await repo.getMovie(result.itemId);
    expect(updated?.status).toBe('MATCHED');
    expect(updated?.title).toBe('The Matrix');
    expect(updated?.tmdbId).toBe(603);
    expect(updated?.matchConfidence).toBe(1.0);
    expect(updated?.matchDetails).toContain('"isManual":true');
  });
});
