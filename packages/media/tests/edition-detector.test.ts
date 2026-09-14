import { describe, expect, it } from 'bun:test';
import { detectEdition, normalizeEditionLabel } from '../src/edition/edition-detector';

describe('Edition Detector & Normalizer', () => {
  describe('normalizeEditionLabel', () => {
    it('normalizes Extended Edition variations', () => {
      expect(normalizeEditionLabel('Extended').normalizedName).toBe('Extended Edition');
      expect(normalizeEditionLabel('Extended Cut').normalizedName).toBe('Extended Edition');
      expect(normalizeEditionLabel('Extended Edition').normalizedName).toBe('Extended Edition');
      expect(normalizeEditionLabel('Extended Version').normalizedName).toBe('Extended Edition');
    });

    it("normalizes Director's Cut variations", () => {
      expect(normalizeEditionLabel('Director Cut').normalizedName).toBe("Director's Cut");
      expect(normalizeEditionLabel('Directors Cut').normalizedName).toBe("Director's Cut");
      expect(normalizeEditionLabel("Director's Cut").normalizedName).toBe("Director's Cut");
      expect(normalizeEditionLabel('Directors Edition').normalizedName).toBe("Director's Cut");
      expect(normalizeEditionLabel('DC').normalizedName).toBe("Director's Cut");
    });

    it('normalizes Final Cut variations', () => {
      expect(normalizeEditionLabel('Final Cut').normalizedName).toBe('Final Cut');
      expect(normalizeEditionLabel('Final Edition').normalizedName).toBe('Final Cut');
    });

    it('normalizes Theatrical Cut variations', () => {
      expect(normalizeEditionLabel('Theatrical').normalizedName).toBe('Theatrical Cut');
      expect(normalizeEditionLabel('Theatrical Cut').normalizedName).toBe('Theatrical Cut');
      expect(normalizeEditionLabel('Theatrical Edition').normalizedName).toBe('Theatrical Cut');
      expect(normalizeEditionLabel('Theatrical Version').normalizedName).toBe('Theatrical Cut');
    });

    it('normalizes Special Edition variations', () => {
      expect(normalizeEditionLabel('Special').normalizedName).toBe('Special Edition');
      expect(normalizeEditionLabel('Special Edition').normalizedName).toBe('Special Edition');
      expect(normalizeEditionLabel('Special Cut').normalizedName).toBe('Special Edition');
    });

    it('normalizes Unrated Cut variations', () => {
      expect(normalizeEditionLabel('Unrated').normalizedName).toBe('Unrated Cut');
      expect(normalizeEditionLabel('Unrated Cut').normalizedName).toBe('Unrated Cut');
      expect(normalizeEditionLabel('Unrated Edition').normalizedName).toBe('Unrated Cut');
    });

    it('normalizes Ultimate Cut variations', () => {
      expect(normalizeEditionLabel('Ultimate').normalizedName).toBe('Ultimate Cut');
      expect(normalizeEditionLabel('Ultimate Cut').normalizedName).toBe('Ultimate Cut');
      expect(normalizeEditionLabel('Ultimate Edition').normalizedName).toBe('Ultimate Cut');
    });

    it('normalizes IMAX Edition variations', () => {
      expect(normalizeEditionLabel('IMAX').normalizedName).toBe('IMAX Edition');
      expect(normalizeEditionLabel('IMAX Edition').normalizedName).toBe('IMAX Edition');
      expect(normalizeEditionLabel('IMAX Enhanced').normalizedName).toBe('IMAX Edition');
    });

    it('normalizes Remastered, Open Matte, and Criterion', () => {
      expect(normalizeEditionLabel('Remastered').normalizedName).toBe('Remastered');
      expect(normalizeEditionLabel('Remastered Edition').normalizedName).toBe('Remastered');
      expect(normalizeEditionLabel('Open Matte').normalizedName).toBe('Open Matte');
      expect(normalizeEditionLabel('Criterion Collection').normalizedName).toBe(
        'Criterion Edition',
      );
    });

    it('formats custom edition names cleanly and classifies as CUSTOM', () => {
      const res = normalizeEditionLabel('black_and_white_version');
      expect(res.normalizedName).toBe('Black And White Version');
      expect(res.type).toBe('CUSTOM');
    });

    it('handles null/empty inputs', () => {
      expect(normalizeEditionLabel(null).normalizedName).toBeNull();
      expect(normalizeEditionLabel('').normalizedName).toBeNull();
    });
  });

  describe('detectEdition', () => {
    it('detects Theatrical Cut from filename', () => {
      const result = detectEdition(
        'Blade.Runner.1982.Theatrical.Cut.1080p.BluRay.mkv',
        'Theatrical',
      );
      expect(result.normalizedName).toBe('Theatrical Cut');
      expect(result.type).toBe('THEATRICAL');
      expect(result.needsReview).toBe(false);
    });

    it('detects Final Cut from filename when guessit misses it', () => {
      const result = detectEdition('Blade.Runner.1982.Final.Cut.2160p.UHD.BluRay.mkv', null);
      expect(result.normalizedName).toBe('Final Cut');
      expect(result.type).toBe('FINAL_CUT');
      expect(result.needsReview).toBe(false);
    });

    it('detects Extended Edition from LOTR filename', () => {
      const result = detectEdition(
        'The Lord of the Rings - The Fellowship of the Ring(2001) - Extended Edition 2160p TrueHD Atmos.mkv',
        'Extended',
      );
      expect(result.normalizedName).toBe('Extended Edition');
      expect(result.type).toBe('EXTENDED');
      expect(result.needsReview).toBe(false);
    });

    it('detects Final Cut from Apocalypse Now path', () => {
      const result = detectEdition(
        '/Volumes/Movies/Apocalypse Now - Final Cut (1979)/Apocalypse Now - Final Cut (1979) 1080p TrueHD Atmos.mkv',
        null,
      );
      expect(result.normalizedName).toBe('Final Cut');
      expect(result.type).toBe('FINAL_CUT');
      expect(result.needsReview).toBe(false);
    });

    it('returns default/no edition for standard movie files', () => {
      const result = detectEdition('The Matrix (1999) 1080p BluRay.mkv', null);
      expect(result.normalizedName).toBeNull();
      expect(result.type).toBe('DEFAULT');
      expect(result.needsReview).toBe(false);
    });

    it('surfaces uncertain/custom cuts for review', () => {
      const result = detectEdition('Blade.Runner.1982.Workprint.Cut.1080p.mkv', null);
      expect(result.normalizedName).toBe('Workprint Cut');
      expect(result.type).toBe('CUSTOM');
      expect(result.needsReview).toBe(true);
    });
  });
});
