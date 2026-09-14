import { describe, expect, it } from 'bun:test';
import type { MovieMetadataCandidate } from '@medialoom/contracts';
import { type LocalMovieMetadata, MovieMatcher } from '../src/matching/movie-matcher';

describe('MovieMatcher (Scoring Engine & Explainability)', () => {
  const matcher = new MovieMatcher();

  const baseCandidate: MovieMetadataCandidate = {
    provider: 'tmdb',
    providerId: '603',
    title: 'The Matrix',
    originalTitle: 'The Matrix',
    year: 1999,
    releaseDate: '1999-03-30',
    runtimeMinutes: 136,
    overview: 'A computer hacker learns about the true nature of reality.',
    posterPath: '/path.jpg',
    posterUrl: 'https://image.tmdb.org/t/p/w500/path.jpg',
    tmdbId: 603,
    imdbId: 'tt0133093',
  };

  it('evaluates exact title + year with high confidence score and exposes components', () => {
    const local: LocalMovieMetadata = {
      title: 'The Matrix',
      year: 1999,
      runtimeMinutes: 136,
    };

    const evalResult = matcher.evaluateCandidate(local, baseCandidate, 0);

    expect(evalResult.score).toBeGreaterThanOrEqual(0.95);
    expect(evalResult.components.title).toBe(0.6);
    expect(evalResult.components.year).toBe(0.25);
    expect(evalResult.components.runtime).toBe(0.1);
    expect(evalResult.components.providerRank).toBe(0.05);
    expect(evalResult.components.penalty).toBe(0);

    // Verify explainability reasons
    expect(evalResult.reasons.length).toBeGreaterThanOrEqual(4);
    expect(evalResult.reasons.some((r) => r.includes('Title similarity'))).toBe(true);
    expect(evalResult.reasons.some((r) => r.includes('Year exact match'))).toBe(true);
  });

  it('applies meaningful contradiction penalty for exact title + incorrect year', () => {
    const local: LocalMovieMetadata = {
      title: 'The Matrix',
      year: 1999,
      runtimeMinutes: 136,
    };

    const wrongYearCandidate: MovieMetadataCandidate = {
      ...baseCandidate,
      providerId: '624860',
      title: 'The Matrix',
      year: 2021, // 22 years difference
      runtimeMinutes: 148,
    };

    const evalResult = matcher.evaluateCandidate(local, wrongYearCandidate, 0);

    // Title is 100% exact (0.60) and rank is 0 (0.05)
    // But severe year contradiction (-0.35) must prevent a near-perfect appearance!
    expect(evalResult.components.title).toBe(0.6);
    expect(evalResult.components.year).toBe(0.0);
    expect(evalResult.components.penalty).toBeLessThanOrEqual(-0.35);

    // Final score must be heavily penalized (< 0.65, UNMATCHED)
    expect(evalResult.score).toBeLessThan(0.65);
    expect(evalResult.reasons.some((r) => r.includes('Year severe contradiction'))).toBe(true);
  });

  it('evaluates similar title (e.g. leading articles or subtitles)', () => {
    const local: LocalMovieMetadata = {
      title: 'Matrix', // missing "The"
      year: 1999,
      runtimeMinutes: 136,
    };

    const evalResult = matcher.evaluateCandidate(local, baseCandidate, 0);

    // Article stripped similarity should give high title score
    expect(evalResult.components.title).toBeGreaterThanOrEqual(0.55);
    expect(evalResult.components.year).toBe(0.25);
    expect(evalResult.score).toBeGreaterThanOrEqual(0.9);
  });

  it('flags ambiguous title as REVIEW_REQUIRED when top candidates have close scores', () => {
    const local: LocalMovieMetadata = {
      title: 'Home',
      year: null,
      runtimeMinutes: null,
    };

    const cand1: MovieMetadataCandidate = {
      ...baseCandidate,
      providerId: '101',
      title: 'Home',
      year: 2009,
    };

    const cand2: MovieMetadataCandidate = {
      ...baseCandidate,
      providerId: '102',
      title: 'Home',
      year: 2015,
    };

    const customMatcher = new MovieMatcher({
      autoMatchThreshold: 0.6,
      ambiguityMargin: 0.05,
    });

    const result = customMatcher.evaluateCandidates(local, [cand1, cand2]);

    // Both have exact title, rank 0 (0.05) vs rank 1 (0.03) -> score diff = 0.02 (< margin 0.05)
    expect(result.decision).toBe('REVIEW_REQUIRED');
    expect(result.selectedCandidate).toBeNull();
  });

  it('handles missing year gracefully without contradiction penalty', () => {
    const local: LocalMovieMetadata = {
      title: 'The Matrix',
      year: null,
      runtimeMinutes: 136,
    };

    const evalResult = matcher.evaluateCandidate(local, baseCandidate, 0);

    expect(evalResult.components.title).toBe(0.6);
    expect(evalResult.components.year).toBe(0.0);
    expect(evalResult.components.penalty).toBe(0.0);
    // Title (0.60) + Runtime (0.10) + Rank (0.05) = 0.75 -> REVIEW_REQUIRED
    expect(evalResult.score).toBe(0.75);
  });

  it('rewards runtime similarity when measured runtime matches candidate', () => {
    const local: LocalMovieMetadata = {
      title: 'Interstellar',
      year: 2014,
      runtimeMinutes: 169,
    };

    const cand: MovieMetadataCandidate = {
      ...baseCandidate,
      title: 'Interstellar',
      year: 2014,
      runtimeMinutes: 169,
    };

    const evalResult = matcher.evaluateCandidate(local, cand, 0);
    expect(evalResult.components.runtime).toBe(0.1);
  });

  it('applies runtime contradiction penalty when runtime wildly differs', () => {
    const local: LocalMovieMetadata = {
      title: 'Sample Film',
      year: 2020,
      runtimeMinutes: 130, // 130 minutes feature film
    };

    const shortFilmCand: MovieMetadataCandidate = {
      ...baseCandidate,
      title: 'Sample Film',
      year: 2020,
      runtimeMinutes: 15, // 15 minutes short film (diff = 115m)
    };

    const evalResult = matcher.evaluateCandidate(local, shortFilmCand, 0);
    expect(evalResult.components.runtime).toBe(0.0);
    expect(evalResult.components.penalty).toBeLessThanOrEqual(-0.2);
    expect(evalResult.reasons.some((r) => r.includes('Runtime severe contradiction'))).toBe(true);
  });

  it('gradually scales provider rank component based on search order', () => {
    const local: LocalMovieMetadata = { title: 'Test', year: 2020 };
    const cand: MovieMetadataCandidate = { ...baseCandidate, title: 'Test', year: 2020 };

    const rank0 = matcher.evaluateCandidate(local, cand, 0);
    const rank1 = matcher.evaluateCandidate(local, cand, 1);
    const rank2 = matcher.evaluateCandidate(local, cand, 2);
    const rank3 = matcher.evaluateCandidate(local, cand, 3);
    const rank4 = matcher.evaluateCandidate(local, cand, 4);

    expect(rank0.components.providerRank).toBe(0.05);
    expect(rank1.components.providerRank).toBe(0.03);
    expect(rank2.components.providerRank).toBe(0.02);
    expect(rank3.components.providerRank).toBe(0.01);
    expect(rank4.components.providerRank).toBe(0.0);
  });

  it('classifies match decision as AUTO_MATCH when score >= 0.90 and unambiguous', () => {
    const local: LocalMovieMetadata = {
      title: 'The Matrix',
      year: 1999,
      runtimeMinutes: 136,
    };

    const result = matcher.evaluateCandidates(local, [
      baseCandidate,
      { ...baseCandidate, providerId: '604', title: 'The Matrix Reloaded', year: 2003 },
    ]);

    expect(result.decision).toBe('AUTO_MATCH');
    expect(result.selectedCandidate?.providerId).toBe('603');
    expect(result.topScore).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies match decision as REVIEW_REQUIRED when 0.65 <= score < 0.90', () => {
    const local: LocalMovieMetadata = {
      title: 'The Matrix',
      year: null, // missing year lowers score to ~0.75
      runtimeMinutes: 136,
    };

    const result = matcher.evaluateCandidates(local, [
      baseCandidate,
      { ...baseCandidate, providerId: '999', title: 'Completely Unrelated', year: 2010 },
    ]);

    expect(result.decision).toBe('REVIEW_REQUIRED');
    expect(result.topScore).toBeGreaterThanOrEqual(0.65);
    expect(result.topScore).toBeLessThan(0.9);
    expect(result.selectedCandidate).toBeNull();
  });

  it('classifies match decision as UNMATCHED when score < 0.65 or no candidates', () => {
    const local: LocalMovieMetadata = {
      title: 'Obscure Unknown Indie Film',
      year: 1985,
    };

    const unrelatedCandidate: MovieMetadataCandidate = {
      ...baseCandidate,
      title: 'Something Else Entirely',
      year: 2024,
    };

    const result = matcher.evaluateCandidates(local, [unrelatedCandidate]);
    expect(result.decision).toBe('UNMATCHED');
    expect(result.selectedCandidate).toBeNull();

    const emptyResult = matcher.evaluateCandidates(local, []);
    expect(emptyResult.decision).toBe('UNMATCHED');
  });

  it('allows configurable thresholds and weights', () => {
    const customMatcher = new MovieMatcher({
      autoMatchThreshold: 0.95,
    });

    const local: LocalMovieMetadata = {
      title: 'The Matrix',
      year: 1999,
      // No runtime: title (0.60) + year (0.25) + rank (0.05) = 0.90
    };

    const result = customMatcher.evaluateCandidates(local, [baseCandidate]);
    // With threshold 0.95, score 0.90 becomes REVIEW_REQUIRED
    expect(result.decision).toBe('REVIEW_REQUIRED');
  });
});
