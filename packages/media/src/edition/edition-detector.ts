import path from 'node:path';

export interface DetectedEditionResult {
  /**
   * The raw detected edition text from filename or guessit
   */
  rawName: string | null;

  /**
   * The canonical normalized display label (e.g. "Director's Cut", "Final Cut", "Extended Edition")
   */
  normalizedName: string | null;

  /**
   * Standardized edition category code
   */
  type: string | null;

  /**
   * Source of detection
   */
  source: 'FILENAME' | 'MANUAL' | 'DEFAULT';

  /**
   * Confidence level from 0.0 to 1.0
   */
  confidence: number;

  /**
   * Flag indicating if the edition assignment should be surfaced for user review
   */
  needsReview: boolean;
}

interface StandardCutRule {
  type: string;
  canonicalName: string;
  pattern: RegExp;
}

const STANDARD_CUT_RULES: StandardCutRule[] = [
  {
    type: 'DIRECTORS_CUT',
    canonicalName: "Director's Cut",
    pattern: /\b(?:directors?['’]?\s*(?:cut|edition|version)|dc)\b/i,
  },
  {
    type: 'FINAL_CUT',
    canonicalName: 'Final Cut',
    pattern: /\bfinal\s*(?:cut|edition|version)\b/i,
  },
  {
    type: 'EXTENDED',
    canonicalName: 'Extended Edition',
    pattern: /\b(?:extended\s*(?:edition|cut|version)|extended|ext)\b/i,
  },
  {
    type: 'THEATRICAL',
    canonicalName: 'Theatrical Cut',
    pattern: /\b(?:theatrical\s*(?:cut|edition|version)|theatrical)\b/i,
  },
  {
    type: 'SPECIAL_EDITION',
    canonicalName: 'Special Edition',
    pattern: /\b(?:special\s*(?:edition|cut|version)|special)\b/i,
  },
  {
    type: 'UNRATED',
    canonicalName: 'Unrated Cut',
    pattern: /\b(?:unrated\s*(?:cut|edition|version)|unrated)\b/i,
  },
  {
    type: 'ULTIMATE_CUT',
    canonicalName: 'Ultimate Cut',
    pattern: /\b(?:ultimate\s*(?:cut|edition|version)|ultimate)\b/i,
  },
  {
    type: 'IMAX',
    canonicalName: 'IMAX Edition',
    pattern: /\b(?:imax\s*(?:edition|enhanced|version)|imax)\b/i,
  },
  {
    type: 'CRITERION',
    canonicalName: 'Criterion Edition',
    pattern: /\b(?:criterion\s*(?:collection|edition|cut)|criterion)\b/i,
  },
  {
    type: 'REMASTERED',
    canonicalName: 'Remastered',
    pattern: /\b(?:remastered\s*(?:edition|cut|version)|remastered|remaster)\b/i,
  },
  {
    type: 'OPEN_MATTE',
    canonicalName: 'Open Matte',
    pattern: /\bopen[\s._-]?matte\b/i,
  },
];

/**
 * Normalizes a detected or user-specified edition string to its standard canonical label
 */
export function normalizeEditionLabel(rawName?: string | null): {
  normalizedName: string | null;
  type: string | null;
} {
  if (!rawName) {
    return { normalizedName: null, type: null };
  }

  const trimmed = rawName.trim();
  if (trimmed.length === 0) {
    return { normalizedName: null, type: null };
  }

  // Check known standard cut rules
  for (const rule of STANDARD_CUT_RULES) {
    if (rule.pattern.test(trimmed)) {
      return {
        normalizedName: rule.canonicalName,
        type: rule.type,
      };
    }
  }

  // Format custom edition nicely (e.g. capitalize words)
  const words = trimmed
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const cleanCustom = words.join(' ');

  return {
    normalizedName: cleanCustom,
    type: 'CUSTOM',
  };
}

/**
 * Extracts and detects edition from filename metadata, filepath tokens, and guessit result.
 */
export function detectEdition(
  filenameOrPath: string,
  guessitEdition?: string | null,
): DetectedEditionResult {
  const filename = path.basename(filenameOrPath);
  // Clean filename: remove extension and replace dots/underscores with spaces
  const ext = path.extname(filename);
  const baseWithoutExt = path.basename(filename, ext);
  const normalizedFilename = baseWithoutExt.replace(/[._-]+/g, ' ');

  // 1. If guessit already identified a clear edition
  if (guessitEdition && guessitEdition.trim().length > 0) {
    const guess = guessitEdition.trim();
    const { normalizedName, type } = normalizeEditionLabel(guess);

    if (normalizedName && type && type !== 'CUSTOM') {
      return {
        rawName: guess,
        normalizedName,
        type,
        source: 'FILENAME',
        confidence: 0.95,
        needsReview: false,
      };
    }
  }

  // 2. Scan filename text against standard cut rules
  for (const rule of STANDARD_CUT_RULES) {
    const match = normalizedFilename.match(rule.pattern);
    if (match) {
      return {
        rawName: match[0],
        normalizedName: rule.canonicalName,
        type: rule.type,
        source: 'FILENAME',
        confidence: 0.9,
        needsReview: false,
      };
    }
  }

  // 3. Scan for generic/custom cuts: e.g. "Workprint Cut", "Assembly Cut", "Restored Cut", "Festival Cut"
  const genericCutMatch = normalizedFilename.match(/\b([a-zA-Z0-9]+)\s*(?:cut|edition|version)\b/i);
  if (genericCutMatch?.[0]) {
    const rawCandidate = genericCutMatch[0].trim();
    const modifier = (genericCutMatch[1] ?? '').toLowerCase();

    // Ignore non-edition descriptors like "1080p edition" or common false positives
    if (
      ![
        'the',
        'a',
        'an',
        'movie',
        'film',
        'video',
        'bluray',
        'web',
        'dvd',
        '1080p',
        '2160p',
        '720p',
        '4k',
      ].includes(modifier)
    ) {
      const { normalizedName, type } = normalizeEditionLabel(rawCandidate);
      return {
        rawName: rawCandidate,
        normalizedName,
        type: type ?? 'CUSTOM',
        source: 'FILENAME',
        confidence: 0.6,
        needsReview: true, // Mark ambiguous custom cuts for review
      };
    }
  }

  // 4. If guessit had a raw custom edition string not matching standard rules
  if (guessitEdition && guessitEdition.trim().length > 0) {
    const guess = guessitEdition.trim();
    const { normalizedName, type } = normalizeEditionLabel(guess);
    return {
      rawName: guess,
      normalizedName,
      type: type ?? 'CUSTOM',
      source: 'FILENAME',
      confidence: 0.7,
      needsReview: true,
    };
  }

  // 5. Default/standard release (no edition)
  return {
    rawName: null,
    normalizedName: null,
    type: 'DEFAULT',
    source: 'DEFAULT',
    confidence: 1.0,
    needsReview: false,
  };
}
