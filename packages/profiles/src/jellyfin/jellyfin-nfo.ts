export interface MovieNfoData {
  title: string;
  originalTitle?: string | null;
  year?: number | null;
  plot?: string | null;
  overview?: string | null;
  runtimeMinutes?: number | null;
  tmdbId?: number | null;
  imdbId?: string | null;
}

/**
 * Strips invalid XML 1.0 characters (such as null bytes and control codes).
 */
function stripInvalidXmlChars(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      code === 0x9 ||
      code === 0xa ||
      code === 0xd ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd)
    ) {
      result += text[i];
    }
  }
  return result;
}

/**
 * Escapes characters for safe inclusion in XML elements and attributes.
 */
export function escapeXml(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const sanitized = stripInvalidXmlChars(text);

  return sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a deterministic, Jellyfin-compatible movie.nfo XML document.
 *
 * Ensures deterministic tag ordering, proper indentation, and XML character escaping.
 */
export function generateDeterministicMovieNfo(data: MovieNfoData): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="utf-8" standalone="yes"?>',
    '<movie>',
    `  <title>${escapeXml(data.title)}</title>`,
  ];

  const origTitle = data.originalTitle ?? data.title;
  if (origTitle) {
    lines.push(`  <originaltitle>${escapeXml(origTitle)}</originaltitle>`);
  }

  if (typeof data.year === 'number' && Number.isFinite(data.year)) {
    lines.push(`  <year>${data.year}</year>`);
  }

  const plotText = data.plot ?? data.overview ?? '';
  if (plotText) {
    lines.push(`  <plot>${escapeXml(plotText)}</plot>`);
  }

  if (typeof data.runtimeMinutes === 'number' && data.runtimeMinutes > 0) {
    lines.push(`  <runtime>${Math.round(data.runtimeMinutes)}</runtime>`);
  }

  if (typeof data.tmdbId === 'number' && data.tmdbId > 0) {
    lines.push(`  <tmdbid>${data.tmdbId}</tmdbid>`);
  }

  if (data.imdbId) {
    lines.push(`  <imdbid>${escapeXml(data.imdbId)}</imdbid>`);
  }

  if (typeof data.tmdbId === 'number' && data.tmdbId > 0) {
    lines.push(`  <uniqueid type="tmdb" default="true">${data.tmdbId}</uniqueid>`);
  }

  if (data.imdbId) {
    lines.push(`  <uniqueid type="imdb">${escapeXml(data.imdbId)}</uniqueid>`);
  }

  lines.push('</movie>', '');

  return lines.join('\n');
}
