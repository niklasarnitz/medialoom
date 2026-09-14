import { describe, expect, it } from 'bun:test';
import { escapeXml, generateDeterministicMovieNfo } from '../src/jellyfin/jellyfin-nfo';

describe('Jellyfin NFO Generator', () => {
  describe('escapeXml', () => {
    it('escapes XML special characters', () => {
      expect(escapeXml('AT&T <Rock & Roll> "Greatest" \'Hits\'')).toBe(
        'AT&amp;T &lt;Rock &amp; Roll&gt; &quot;Greatest&quot; &apos;Hits&apos;',
      );
    });

    it('strips non-printable control characters', () => {
      expect(escapeXml('Hello\x00\x08World\x1F')).toBe('HelloWorld');
    });

    it('handles empty / non-string inputs safely', () => {
      expect(escapeXml('')).toBe('');
      // @ts-expect-error test invalid inputs
      expect(escapeXml(null)).toBe('');
    });
  });

  describe('generateDeterministicMovieNfo', () => {
    it('generates deterministic XML for The Matrix (1999)', () => {
      const data = {
        title: 'The Matrix',
        originalTitle: 'The Matrix',
        year: 1999,
        overview:
          'A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.',
        runtimeMinutes: 136,
        tmdbId: 603,
        imdbId: 'tt0133093',
      };

      const expectedXml = [
        '<?xml version="1.0" encoding="utf-8" standalone="yes"?>',
        '<movie>',
        '  <title>The Matrix</title>',
        '  <originaltitle>The Matrix</originaltitle>',
        '  <year>1999</year>',
        '  <plot>A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.</plot>',
        '  <runtime>136</runtime>',
        '  <tmdbid>603</tmdbid>',
        '  <imdbid>tt0133093</imdbid>',
        '  <uniqueid type="tmdb" default="true">603</uniqueid>',
        '  <uniqueid type="imdb">tt0133093</uniqueid>',
        '</movie>',
        '',
      ].join('\n');

      const xml1 = generateDeterministicMovieNfo(data);
      const xml2 = generateDeterministicMovieNfo(data);

      expect(xml1).toBe(expectedXml);
      expect(xml1).toBe(xml2); // Strict determinism
    });

    it('handles missing IMDb ID cleanly', () => {
      const data = {
        title: 'Indie Film',
        year: 2024,
        overview: 'An indie movie.',
        runtimeMinutes: 90,
        tmdbId: 999999,
        imdbId: null,
      };

      const xml = generateDeterministicMovieNfo(data);

      expect(xml).toContain('<title>Indie Film</title>');
      expect(xml).toContain('<tmdbid>999999</tmdbid>');
      expect(xml).toContain('<uniqueid type="tmdb" default="true">999999</uniqueid>');
      expect(xml).not.toContain('<imdbid>');
      expect(xml).not.toContain('type="imdb"');
    });

    it('handles special characters and escapes them in XML tags', () => {
      const data = {
        title: 'Fast & Furious <Special> "Edition"',
        originalTitle: "Fast & Furious 'Original'",
        year: 2001,
        overview: 'Cars & racing > speed & style "action".',
        runtimeMinutes: 106,
        tmdbId: 9799,
        imdbId: 'tt0232500',
      };

      const xml = generateDeterministicMovieNfo(data);

      expect(xml).toContain(
        '<title>Fast &amp; Furious &lt;Special&gt; &quot;Edition&quot;</title>',
      );
      expect(xml).toContain(
        '<originaltitle>Fast &amp; Furious &apos;Original&apos;</originaltitle>',
      );
      expect(xml).toContain(
        '<plot>Cars &amp; racing &gt; speed &amp; style &quot;action&quot;.</plot>',
      );
    });

    it('falls back to title when originalTitle is missing', () => {
      const data = {
        title: 'Blade Runner',
        year: 1982,
        tmdbId: 78,
      };

      const xml = generateDeterministicMovieNfo(data);
      expect(xml).toContain('<title>Blade Runner</title>');
      expect(xml).toContain('<originaltitle>Blade Runner</originaltitle>');
    });
  });
});
