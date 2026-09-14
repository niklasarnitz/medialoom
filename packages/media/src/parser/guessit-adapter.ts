import path from 'node:path';
import { type GuessItResult, type GuessitLanguage, guessit } from 'guessit-js';

export interface NormalizedFilenameMetadata {
  title: string | null;
  year: number | null;
  type: string | null;
  edition: string | null;
  screenSize: string | null;
  source: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  audioChannels: string | null;
  releaseGroup: string | null;
  streamingService: string | null;
  container: string | null;
  language: string | null;
  rawJson: string;
}

function stringifyValue(val: unknown): string | null {
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof val === 'number') {
    return String(val);
  }
  if (Array.isArray(val)) {
    const items = val.map(stringifyValue).filter((item): item is string => item !== null);
    return items.length > 0 ? items.join(', ') : null;
  }
  return String(val);
}

function normalizeNumber(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.trunc(val) : null;
  }
  if (typeof val === 'string') {
    const parsed = Number.parseInt(val, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (Array.isArray(val) && val.length > 0) {
    return normalizeNumber(val[0]);
  }
  return null;
}

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

function resolveLanguageName(code: string): string {
  try {
    const resolved = languageNames.of(code);
    if (resolved && resolved.length > 0) {
      return resolved;
    }
  } catch {
    // Ignore invalid codes and fallback to original
  }
  return code;
}

function formatLanguageItem(item: unknown): string | null {
  if (!item) {
    return null;
  }
  if (typeof item === 'string') {
    return resolveLanguageName(item.trim());
  }
  if (typeof item === 'object') {
    const lang = item as GuessitLanguage;
    if (typeof lang.name === 'string' && lang.name.length > 0) {
      return lang.name;
    }
    if (typeof lang.alpha3 === 'string' && lang.alpha3.length > 0) {
      return resolveLanguageName(lang.alpha3);
    }
    if (typeof lang.alpha2 === 'string' && lang.alpha2.length > 0) {
      return resolveLanguageName(lang.alpha2);
    }
  }
  return String(item);
}

function normalizeLanguage(val: unknown): string | null {
  if (val === null || val === undefined) {
    return null;
  }
  if (Array.isArray(val)) {
    const parts = val.map(formatLanguageItem).filter((item): item is string => item !== null);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  return formatLanguageItem(val);
}

export class GuessitAdapter {
  parse(filenameOrPath: string): NormalizedFilenameMetadata {
    // Extract base filename so directory paths don't mislead filename matching
    const filename = path.basename(filenameOrPath);
    const rawResult: GuessItResult = guessit(filename);

    const title = stringifyValue(rawResult.title);
    const year = normalizeNumber(rawResult.year);
    const type = stringifyValue(rawResult.type);
    const edition = stringifyValue(rawResult.edition);
    const screenSize = stringifyValue(rawResult.screen_size);
    const source = stringifyValue(rawResult.source);
    const videoCodec = stringifyValue(rawResult.video_codec);
    const audioCodec = stringifyValue(rawResult.audio_codec);
    const audioChannels = stringifyValue(rawResult.audio_channels);
    const releaseGroup = stringifyValue(rawResult.release_group);
    const streamingService = stringifyValue(rawResult.streaming_service);
    const container = stringifyValue(rawResult.container);
    const language = normalizeLanguage(rawResult.language);

    return {
      title,
      year,
      type,
      edition,
      screenSize,
      source,
      videoCodec,
      audioCodec,
      audioChannels,
      releaseGroup,
      streamingService,
      container,
      language,
      rawJson: JSON.stringify(rawResult),
    };
  }
}

export const defaultGuessitAdapter = new GuessitAdapter();

export function parseFilename(filenameOrPath: string): NormalizedFilenameMetadata {
  return defaultGuessitAdapter.parse(filenameOrPath);
}
