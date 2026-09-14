import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { MovieMetadataCandidate } from '@medialoom/contracts';
import { closeDatabaseConnection, getPrismaClient, InventoryRepository } from '@medialoom/db';
import type { MovieMetadataProvider } from '@medialoom/providers';
import { MatchingService } from '../src/matching/matching-service';
import { MetadataService } from '../src/metadata/metadata-service';

describe('Stage 6 Acceptance Test: Deterministic Movie Matching', () => {
  let repo: InventoryRepository;

  // Realistic TMDb mock candidates for "The Matrix" query
  const realisticTmdbCandidates: MovieMetadataCandidate[] = [
    {
      provider: 'tmdb',
      providerId: '603',
      title: 'The Matrix',
      originalTitle: 'The Matrix',
      year: 1999,
      releaseDate: '1999-03-30',
      runtimeMinutes: 136,
      overview:
        'Set in the 22nd century, The Matrix tells the story of a computer hacker who learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.',
      posterPath: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
      posterUrl: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
      tmdbId: 603,
      imdbId: 'tt0133093',
    },
    {
      provider: 'tmdb',
      providerId: '604',
      title: 'The Matrix Reloaded',
      originalTitle: 'The Matrix Reloaded',
      year: 2003,
      releaseDate: '2003-05-15',
      runtimeMinutes: 138,
      overview:
        'Neo and the rebel leaders estimate that they have 72 hours until 250,000 probes discover Zion.',
      posterPath: '/9TGHDvWrqKBpuDxakLgnIC3wX9r.jpg',
      posterUrl: 'https://image.tmdb.org/t/p/w500/9TGHDvWrqKBpuDxakLgnIC3wX9r.jpg',
      tmdbId: 604,
      imdbId: 'tt0234215',
    },
    {
      provider: 'tmdb',
      providerId: '605',
      title: 'The Matrix Revolutions',
      originalTitle: 'The Matrix Revolutions',
      year: 2003,
      releaseDate: '2003-11-05',
      runtimeMinutes: 129,
      overview:
        'The human city of Zion defends itself against the massive invasion of the machines.',
      posterPath: '/qA567b57F24L0s2A45x6o.jpg',
      posterUrl: 'https://image.tmdb.org/t/p/w500/qA567b57F24L0s2A45x6o.jpg',
      tmdbId: 605,
      imdbId: 'tt0242653',
    },
    {
      provider: 'tmdb',
      providerId: '14543',
      title: 'The Matrix Revisited',
      originalTitle: 'The Matrix Revisited',
      year: 2001,
      releaseDate: '2001-11-20',
      runtimeMinutes: 123,
      overview:
        'A behind-the-scenes look at the making of the classic sci-fi action film The Matrix.',
      posterPath: '/revisited.jpg',
      posterUrl: 'https://image.tmdb.org/t/p/w500/revisited.jpg',
      tmdbId: 14543,
      imdbId: 'tt0295432',
    },
    {
      provider: 'tmdb',
      providerId: '624860',
      title: 'The Matrix Resurrections',
      originalTitle: 'The Matrix Resurrections',
      year: 2021,
      releaseDate: '2021-12-22',
      runtimeMinutes: 148,
      overview: 'Plagued by strange memories, Neo finds himself back inside the Matrix.',
      posterPath: '/resurrections.jpg',
      posterUrl: 'https://image.tmdb.org/t/p/w500/resurrections.jpg',
      tmdbId: 624860,
      imdbId: 'tt10838180',
    },
  ];

  const mockProvider: MovieMetadataProvider = {
    name: 'tmdb',
    searchMovies: async (query) => {
      if (query.query.toLowerCase().includes('matrix')) {
        return realisticTmdbCandidates;
      }
      return [];
    },
    getMovie: async (id) => {
      const found = realisticTmdbCandidates.find((c) => c.providerId === String(id));
      return found ?? null;
    },
  };

  beforeAll(async () => {
    repo = new InventoryRepository(getPrismaClient());
    const prisma = getPrismaClient();
    await prisma.movie.deleteMany({
      where: {
        OR: [{ tmdbId: 603 }, { title: { contains: 'The Matrix' } }],
      },
    });
  });

  afterAll(async () => {
    await closeDatabaseConnection();
  });

  it('The Matrix (1999), when compared against realistic mocked TMDb candidates, selects TMDb 603 with a high confidence score and exposes score components', async () => {
    // 1. Arrange: Scanned movie item in inventory from The.Matrix.1999.1080p.mkv
    const movie = await repo.createMovie({
      title: 'The Matrix',
      year: 1999,
      status: 'UNMATCHED',
    });
    const edition = await repo.createEdition({
      movieId: movie.id,
      name: 'Theatrical',
    });
    const version = await repo.createMediaVersion({
      editionId: edition.id,
      name: '1080p BluRay',
    });
    const asset = await repo.createAsset({
      mediaVersionId: version.id,
      path: `/media/movies/The.Matrix.1999.1080p.mkv`,
      sizeBytes: 12_500_000_000,
      mtime: new Date(),
    });
    // Measured actual runtime: 136 minutes (8160.5 seconds)
    await repo.setTechnicalMetadata({
      assetId: asset.id,
      container: 'matroska',
      durationSeconds: 8160.5,
      videoCodec: 'h264',
    });

    const metadataService = new MetadataService(mockProvider, repo);
    const matchingService = new MatchingService({
      metadataService,
      inventoryRepo: repo,
    });

    // 2. Act: Run the matching pipeline
    const matchResult = await matchingService.matchItem(movie.id);

    // 3. Assert Match Decision & Selected Candidate
    expect(matchResult.decision).toBe('AUTO_MATCH');
    expect(matchResult.selectedCandidate).not.toBeNull();
    expect(matchResult.selectedCandidate?.tmdbId).toBe(603);
    expect(matchResult.selectedCandidate?.providerId).toBe('603');
    expect(matchResult.selectedCandidate?.title).toBe('The Matrix');
    expect(matchResult.selectedCandidate?.year).toBe(1999);

    // 4. Assert Confidence Score and Component Explainability
    // Confidence must be >= 0.90 for AUTO_MATCH (here perfect match = 1.00)
    expect(matchResult.score).toBeGreaterThanOrEqual(0.95);
    expect(matchResult.components).toBeDefined();
    expect(matchResult.components?.title).toBe(0.6);
    expect(matchResult.components?.year).toBe(0.25);
    expect(matchResult.components?.runtime).toBe(0.1);
    expect(matchResult.components?.providerRank).toBe(0.05);
    expect(matchResult.components?.penalty).toBe(0);

    // Assert runner-up candidates are properly differentiated:
    // The Matrix Resurrections (2021) should have severe contradiction penalty (-0.35)
    const resurrectionEval = matchResult.evaluations.find(
      (e) => e.candidate.providerId === '624860',
    );
    expect(resurrectionEval).toBeDefined();
    expect(resurrectionEval?.components.penalty).toBeLessThanOrEqual(-0.35);
    expect(resurrectionEval?.score).toBeLessThan(0.65);

    // 5. Assert Database Persistence:
    // Canonical metadata is saved, status is MATCHED, and score components are stored
    const persistedMovie = await repo.getMovie(movie.id);
    expect(persistedMovie).not.toBeNull();
    expect(persistedMovie?.status).toBe('MATCHED');
    expect(persistedMovie?.tmdbId).toBe(603);
    expect(persistedMovie?.imdbId).toBe('tt0133093');
    expect(persistedMovie?.runtimeMinutes).toBe(136);
    expect(persistedMovie?.overview).toContain('computer hacker who learns');
    expect(persistedMovie?.matchConfidence).toBe(matchResult.score);

    // Verify explainability JSON stored in matchDetails column
    expect(persistedMovie?.matchDetails).not.toBeNull();
    if (!persistedMovie?.matchDetails) throw new Error('Expected matchDetails to be present');
    if (!matchResult.components) throw new Error('Expected matchResult.components');
    const storedDetails = JSON.parse(persistedMovie.matchDetails);
    expect(storedDetails.score).toBe(matchResult.score);
    expect(storedDetails.decision).toBe('AUTO_MATCH');
    expect(storedDetails.components).toEqual(matchResult.components);
    expect(storedDetails.provider).toBe('tmdb');
    expect(storedDetails.providerId).toBe('603');
    expect(storedDetails.reasons.length).toBeGreaterThan(0);
  });
});
