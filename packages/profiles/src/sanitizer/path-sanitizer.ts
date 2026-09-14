import path from 'node:path';

/**
 * Windows reserved device names (case-insensitive).
 */
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

/**
 * Strips control characters (0x00-0x1F and 0x7F-0x9F).
 */
function stripPathControlChars(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 32 && code !== 127 && (code < 128 || code > 159)) {
      result += text[i];
    }
  }
  return result;
}

/**
 * Sanitizes a single path segment (such as a directory name or file basename).
 *
 * Protects against:
 * - Path traversal (.., .)
 * - Slashes and backslashes (/ and \)
 * - Colons and illegal filesystem characters (*, ?, ", <, >, |)
 * - Control characters (\x00-\x1F, \x7F-\x9F)
 * - Leading and trailing whitespace and periods
 * - Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
 * - Absolute path injection
 */
export function sanitizePathComponent(raw: string, fallback = 'Unknown'): string {
  if (!raw || typeof raw !== 'string') {
    return fallback;
  }

  // 1. Unicode normalization (NFKC)
  let cleaned = raw.normalize('NFKC');

  // 2. Remove null bytes and control characters
  cleaned = stripPathControlChars(cleaned);

  // 3. Remove leading traversal sequences (e.g. ../, ..\, /)
  cleaned = cleaned.replace(/^(?:(?:\.\.|\.)[/\\]+)+/, '');
  // Remove embedded traversal sequences
  cleaned = cleaned.replace(/[/\\](?:\.\.|\.)(?=[/\\]|$)/g, '');

  // 4. Replace path separators and colons with a readable separator
  cleaned = cleaned.replace(/[/\\:]+/g, ' - ');

  // 5. Remove other invalid / dangerous filesystem characters: < > " | ? *
  cleaned = cleaned.replace(/[<>"|?*]/g, '');

  // 6. Replace multiple whitespace or dashes with single instances
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\s*-\s*-\s*/g, ' - ');

  // 7. Trim whitespace, leading dashes, dots, and trailing dashes
  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/^[.\s-]+|[.\s-]+$/g, '');

  // 8. Check if empty or only traversal markers
  if (!cleaned || cleaned === '.' || cleaned === '..' || cleaned === 'Unknown') {
    return fallback;
  }

  // 9. Handle Windows reserved device names
  const baseUpper = cleaned.split('.')[0]?.toUpperCase() ?? '';
  if (WINDOWS_RESERVED_NAMES.has(baseUpper)) {
    cleaned = `_${cleaned}`;
  }

  return cleaned || fallback;
}

/**
 * Resolves a destination path and verifies that it is strictly contained within the destination root.
 *
 * Throws an Error if the resolved path attempts to escape destinationRoot.
 */
export function resolveContainedPath(destinationRoot: string, ...segments: string[]): string {
  if (!destinationRoot || typeof destinationRoot !== 'string') {
    throw new Error('Destination root must be a non-empty string.');
  }

  const resolvedRoot = path.resolve(destinationRoot);
  const resolvedTarget = path.resolve(resolvedRoot, ...segments);

  const relative = path.relative(resolvedRoot, resolvedTarget);

  // If relative path starts with '..' or is absolute, it escapes the root
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Path traversal detected: target path "${resolvedTarget}" escapes destination root "${resolvedRoot}".`,
    );
  }

  return resolvedTarget;
}
