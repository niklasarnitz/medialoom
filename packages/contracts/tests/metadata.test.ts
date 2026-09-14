import { describe, expect, it } from 'bun:test';
import {
  candidatesEnvelopeSchema,
  movieMetadataCandidateSchema,
  movieSearchQuerySchema,
  systemSettingEnvelopeSchema,
} from '../src';

describe('Metadata Domain Contracts', () => {
  it('validates a movie search query', () => {
    const valid = movieSearchQuerySchema.parse({
      query: 'The Matrix',
      year: 1999,
    });
    expect(valid.query).toBe('The Matrix');
    expect(valid.year).toBe(1999);
  });

  it('validates a normalized movie metadata candidate', () => {
    const candidate = movieMetadataCandidateSchema.parse({
      provider: 'tmdb',
      providerId: '603',
      title: 'The Matrix',
      originalTitle: 'The Matrix',
      year: 1999,
      releaseDate: '1999-03-30',
      runtimeMinutes: 136,
      overview: 'A hacker learns the truth about reality...',
      posterPath: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
      posterUrl: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
      tmdbId: 603,
      imdbId: 'tt0133093',
    });

    expect(candidate.provider).toBe('tmdb');
    expect(candidate.tmdbId).toBe(603);
    expect(candidate.runtimeMinutes).toBe(136);
  });

  it('validates candidates envelope with defaults', () => {
    const envelope = candidatesEnvelopeSchema.parse({
      itemId: 'clitem123',
      query: 'The Matrix',
      year: 1999,
      candidates: [
        {
          provider: 'tmdb',
          providerId: '603',
          title: 'The Matrix',
          year: 1999,
          tmdbId: 603,
        },
      ],
    });

    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.candidates.length).toBe(1);
  });

  it('validates system setting envelope', () => {
    const envelope = systemSettingEnvelopeSchema.parse({
      key: 'tmdb_api_key',
      value: 'eyJh***',
      masked: true,
      configured: true,
    });

    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.masked).toBe(true);
    expect(envelope.configured).toBe(true);
  });
});
