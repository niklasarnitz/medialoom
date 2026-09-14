import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { resolveContainedPath, sanitizePathComponent } from '../src/sanitizer/path-sanitizer';

describe('Path Sanitizer', () => {
  describe('sanitizePathComponent', () => {
    it('handles standard titles without changes', () => {
      expect(sanitizePathComponent('The Matrix')).toBe('The Matrix');
      expect(sanitizePathComponent('Inception')).toBe('Inception');
      expect(sanitizePathComponent('Interstellar')).toBe('Interstellar');
    });

    it('sanitizes punctuation and illegal filesystem characters', () => {
      // Slashes and colons become ' - '
      expect(sanitizePathComponent('Face/Off')).toBe('Face - Off');
      expect(sanitizePathComponent('Alien: Covenant')).toBe('Alien - Covenant');
      expect(sanitizePathComponent('Mission: Impossible / Rogue Nation')).toBe(
        'Mission - Impossible - Rogue Nation',
      );
      // Illegal characters < > " | ? * are stripped
      expect(sanitizePathComponent('What If...? <Special Edition>*')).toBe(
        'What If... Special Edition',
      );
      expect(sanitizePathComponent('"Good" Movie?')).toBe('Good Movie');
      expect(sanitizePathComponent('Movie | Special')).toBe('Movie Special');
    });

    it('preserves Unicode titles properly', () => {
      expect(sanitizePathComponent('Amélie')).toBe('Amélie');
      expect(sanitizePathComponent('千と千尋の神隠し')).toBe('千と千尋の神隠し');
      expect(sanitizePathComponent('Сталкер')).toBe('Сталкер');
      expect(sanitizePathComponent('WALL·E')).toBe('WALL·E');
      expect(sanitizePathComponent('La vita è bella')).toBe('La vita è bella');
    });

    it('neutralizes malicious titles and path traversal sequences', () => {
      expect(sanitizePathComponent('../../../etc/passwd')).toBe('etc - passwd');
      expect(sanitizePathComponent('..\\..\\Windows\\System32')).toBe('Windows - System32');
      expect(sanitizePathComponent('/root/secrets')).toBe('root - secrets');
      expect(sanitizePathComponent('..')).toBe('Unknown');
      expect(sanitizePathComponent('.')).toBe('Unknown');
      expect(sanitizePathComponent('')).toBe('Unknown');
    });

    it('strips control characters and null bytes', () => {
      expect(sanitizePathComponent('The\x00Matrix\x1F')).toBe('TheMatrix');
      expect(sanitizePathComponent('Title\r\nWith\tNewlines')).toBe('TitleWithNewlines');
    });

    it('safely handles Windows reserved device names', () => {
      expect(sanitizePathComponent('CON')).toBe('_CON');
      expect(sanitizePathComponent('con')).toBe('_con');
      expect(sanitizePathComponent('PRN')).toBe('_PRN');
      expect(sanitizePathComponent('AUX')).toBe('_AUX');
      expect(sanitizePathComponent('NUL')).toBe('_NUL');
      expect(sanitizePathComponent('COM1')).toBe('_COM1');
      expect(sanitizePathComponent('LPT3')).toBe('_LPT3');
      expect(sanitizePathComponent('CON.mkv')).toBe('_CON.mkv');
    });

    it('strips leading and trailing dots and spaces', () => {
      expect(sanitizePathComponent('   Movie Name.  ')).toBe('Movie Name');
      expect(sanitizePathComponent('...Movie...')).toBe('Movie');
    });
  });

  describe('resolveContainedPath', () => {
    const root = '/media/destination/movies';

    it('resolves safe relative paths inside destination root', () => {
      const resolved = resolveContainedPath(root, 'The Matrix (1999) [tmdbid-603]', 'movie.nfo');
      expect(resolved).toBe(path.resolve(root, 'The Matrix (1999) [tmdbid-603]', 'movie.nfo'));
      expect(resolved.startsWith(path.resolve(root))).toBe(true);
    });

    it('throws error when a path segment attempts to escape the root', () => {
      expect(() => {
        resolveContainedPath(root, '../../etc/passwd');
      }).toThrow(/Path traversal detected/);

      expect(() => {
        resolveContainedPath(root, 'folder', '../../../outside.txt');
      }).toThrow(/Path traversal detected/);
    });

    it('throws error when destinationRoot is empty', () => {
      expect(() => {
        resolveContainedPath('', 'movie');
      }).toThrow(/Destination root must be a non-empty string/);
    });
  });
});
