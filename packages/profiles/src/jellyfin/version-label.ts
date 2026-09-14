import type { MediaVersionWithHierarchy } from '@medialoom/db';

export interface MediaVersionDescriptor {
  id?: string;
  source?: string | null;
  resolution?: string | null;
  width?: number | null;
  height?: number | null;
  videoCodec?: string | null;
  hdrFormat?: string | null;
  bitDepth?: number | null;
  audioCodec?: string | null;
  audioChannels?: number | null;
  releaseGroup?: string | null;
  edition?: string | null;
  rawName?: string | null;
  assetPath?: string | null;
}

/**
 * Normalizes source name from filename metadata or strings
 */
export function normalizeSource(
  sourceRaw?: string | null,
  resolution?: string | null,
): string | null {
  if (!sourceRaw) return null;
  const s = sourceRaw.trim();

  if (
    /ultra[\s._-]?hd[\s._-]?blu[\s._-]?ray|uhd[\s._-]?blu[\s._-]?ray|uhd[\s._-]?bd|4k[\s._-]?uhd/i.test(
      s,
    )
  ) {
    return 'UHD BluRay';
  }
  if (/blu[\s._-]?ray|bdrip|brrip|\bbd\b/i.test(s)) {
    return resolution === '2160p' ? 'UHD BluRay' : 'BluRay';
  }
  if (/hd[\s._-]?dvd/i.test(s)) {
    return 'HD-DVD';
  }
  if (/dvd[\s._-]?rip|dvd-r|dvd/i.test(s)) {
    return 'DVD';
  }
  if (/web[\s._-]?dl/i.test(s)) {
    return 'WEB-DL';
  }
  if (/web[\s._-]?rip/i.test(s)) {
    return 'WEBRip';
  }
  if (/hdtv/i.test(s)) {
    return 'HDTV';
  }

  return s;
}

/**
 * Derives standard resolution string (e.g. "2160p", "1080p", "720p", "576p", "480p")
 * prioritizing measured technical properties over filename claims.
 */
export function deriveResolution(
  technical?: { width?: number | null; height?: number | null } | null,
  filenameScreenSize?: string | null,
  source?: string | null,
): string | null {
  if (technical?.height && technical.height > 0) {
    const h = technical.height;
    const w = technical.width ?? 0;

    if (h >= 2000 || w >= 3600) return '2160p';
    if (h >= 1000 || w >= 1800) return '1080p';
    if (h >= 700 || w >= 1200) return '720p';
    if (h >= 540 || (h >= 500 && (source === 'DVD' || /dvd/i.test(source ?? '')))) return '576p';
    if (h >= 460) return '480p';
    return `${h}p`;
  }

  if (filenameScreenSize) {
    const norm = filenameScreenSize.trim().toLowerCase();
    if (norm === '4k' || norm === '2160p' || norm === 'uhd') return '2160p';
    if (norm === '1080p' || norm === '1080i') return '1080p';
    if (norm === '720p') return '720p';
    if (norm === '576p' || norm === '576i') return '576p';
    if (norm === '480p' || norm === '480i') return '480p';
    return filenameScreenSize.trim();
  }

  return null;
}

/**
 * Normalizes video codec name into a clean, human-readable label component
 */
export function normalizeVideoCodec(
  technicalCodec?: string | null,
  filenameCodec?: string | null,
): string | null {
  const raw = (filenameCodec || technicalCodec || '').trim().toLowerCase();
  if (!raw) return null;

  if (raw === 'x265') return 'x265';
  if (raw === 'x264') return 'x264';
  if (/hevc|h265|h\.265/i.test(raw)) return 'HEVC';
  if (/h264|h\.264|avc/i.test(raw)) return 'H.264';
  if (/av1/i.test(raw)) return 'AV1';
  if (/vc1|vc-1/i.test(raw)) return 'VC-1';
  if (/mpeg2/i.test(raw)) return 'MPEG2';

  return filenameCodec || technicalCodec || null;
}

/**
 * Normalizes HDR indicators
 */
export function normalizeHdr(hdrFormat?: string | null, bitDepth?: number | null): string | null {
  if (!hdrFormat) {
    if (bitDepth && bitDepth > 8) return '10-bit';
    return null;
  }
  const raw = hdrFormat.toLowerCase();
  if (raw.includes('dolby vision') || raw.includes('dv')) {
    if (raw.includes('hdr10') || raw.includes('hdr')) return 'DV HDR';
    return 'DV';
  }
  if (raw.includes('hdr10+')) return 'HDR10+';
  if (raw.includes('hdr10') || raw.includes('hdr')) return 'HDR';
  if (raw.includes('hlg')) return 'HLG';
  return hdrFormat.trim();
}

/**
 * Normalizes audio format
 */
export function normalizeAudio(codec?: string | null, channels?: number | null): string | null {
  if (!codec) return null;
  const c = codec.trim().toUpperCase();
  const ch = channels
    ? channels === 8
      ? '7.1'
      : channels === 6
        ? '5.1'
        : channels === 2
          ? '2.0'
          : `${channels}ch`
    : '';
  if (c.includes('TRUEHD')) return ch ? `TrueHD ${ch}` : 'TrueHD';
  if (c.includes('DTS-HD') || c.includes('DTSHD')) return ch ? `DTS-HD MA ${ch}` : 'DTS-HD MA';
  if (c.includes('DTS')) return ch ? `DTS ${ch}` : 'DTS';
  if (c.includes('EAC3') || c.includes('E-AC3')) return ch ? `EAC3 ${ch}` : 'EAC3';
  if (c.includes('AC3') || c.includes('AC-3')) return ch ? `AC3 ${ch}` : 'AC3';
  if (c.includes('FLAC')) return ch ? `FLAC ${ch}` : 'FLAC';
  if (c.includes('AAC')) return ch ? `AAC ${ch}` : 'AAC';
  return ch ? `${c} ${ch}` : c;
}

/**
 * Extracts a MediaVersionDescriptor from a MediaVersion record
 */
export function extractVersionDescriptor(
  version: MediaVersionWithHierarchy,
): MediaVersionDescriptor {
  const primaryAsset = version.assets[0];
  const technical = primaryAsset?.technicalMetadata;
  const filename = primaryAsset?.filenameMetadata;

  const resolution = deriveResolution(technical, filename?.screenSize, filename?.source);
  const source = normalizeSource(filename?.source, resolution);
  const videoCodec = normalizeVideoCodec(technical?.videoCodec, filename?.videoCodec);
  const hdrFormat = normalizeHdr(technical?.hdrFormat, technical?.bitDepth);
  const audioCodec = technical?.audioCodec || filename?.audioCodec || null;
  const audioChannels = technical?.audioChannels || null;
  const releaseGroup = filename?.releaseGroup || null;
  const edition = filename?.edition || null;

  return {
    id: version.id,
    source,
    resolution,
    width: technical?.width,
    height: technical?.height,
    videoCodec,
    hdrFormat,
    bitDepth: technical?.bitDepth,
    audioCodec,
    audioChannels,
    releaseGroup,
    edition,
    rawName: version.name,
    assetPath: primaryAsset?.path,
  };
}

/**
 * Generates the primary/base Jellyfin version label for a descriptor.
 * Examples:
 * - "2160p UHD BluRay"
 * - "1080p BluRay"
 * - "576p DVD"
 * - "1080p WEB-DL"
 * - "DVD"
 * - "1080p"
 */
export function generateBaseVersionLabel(desc: MediaVersionDescriptor): string {
  if (desc.resolution && desc.source) {
    if (desc.source === 'UHD BluRay' && desc.resolution === '2160p') {
      return '2160p UHD BluRay';
    }
    if (desc.source === 'BluRay' && desc.resolution === '1080p') {
      return '1080p BluRay';
    }
    if (desc.source === 'DVD') {
      return `${desc.resolution} DVD`;
    }
    return `${desc.resolution} ${desc.source}`;
  }

  if (desc.resolution) {
    return desc.resolution;
  }

  if (desc.source) {
    return desc.source;
  }

  if (desc.rawName && desc.rawName.trim().length > 0) {
    return desc.rawName.trim();
  }

  if (desc.videoCodec) {
    return desc.videoCodec;
  }

  return 'Default';
}

/**
 * Resolves version labels for a collection of versions belonging to the same movie,
 * deterministically resolving any label collisions.
 */
export function resolveVersionLabels(descriptors: MediaVersionDescriptor[]): Map<string, string> {
  const resultMap = new Map<string, string>();
  if (descriptors.length === 0) return resultMap;

  // Single version: use base label
  if (descriptors.length === 1) {
    const single = descriptors[0];
    if (single) {
      const key = single.id || single.assetPath || '0';
      resultMap.set(key, generateBaseVersionLabel(single));
    }
    return resultMap;
  }

  // 1. Group by initial base label
  const groups = new Map<string, MediaVersionDescriptor[]>();
  for (const desc of descriptors) {
    const base = generateBaseVersionLabel(desc);
    const existing = groups.get(base) ?? [];
    existing.push(desc);
    groups.set(base, existing);
  }

  for (const [baseLabel, group] of groups.entries()) {
    if (group.length === 1) {
      const desc = group[0];
      if (desc) {
        const key = desc.id || desc.assetPath || '0';
        resultMap.set(key, baseLabel);
      }
      continue;
    }

    // Collision in this group: extend labels deterministically
    resolveCollidingGroup(baseLabel, group, resultMap);
  }

  return resultMap;
}

function resolveCollidingGroup(
  baseLabel: string,
  group: MediaVersionDescriptor[],
  resultMap: Map<string, string>,
): void {
  // Try Level 1: Extend with HDR where available
  const hasHdrDifferences = new Set(group.map((d) => d.hdrFormat || 'SDR')).size > 1;
  if (hasHdrDifferences) {
    const candidateMap = new Map<MediaVersionDescriptor, string>();
    for (const d of group) {
      const hdr = d.hdrFormat || (d.bitDepth && d.bitDepth > 8 ? '10-bit' : '');
      const label = hdr ? `${baseLabel} ${hdr}` : baseLabel;
      candidateMap.set(d, label);
    }
    if (allDistinct(Array.from(candidateMap.values()))) {
      for (const [d, label] of candidateMap) {
        const key = d.id || d.assetPath || '';
        resultMap.set(key, label);
      }
      return;
    }
  }

  // Try Level 2: Extend with Video Codec
  const hasCodecDifferences = new Set(group.map((d) => d.videoCodec || '')).size > 1;
  if (hasCodecDifferences) {
    const candidateMap = new Map<MediaVersionDescriptor, string>();
    for (const d of group) {
      const codec = d.videoCodec;
      const label = codec ? `${baseLabel} ${codec}` : baseLabel;
      candidateMap.set(d, label);
    }
    if (allDistinct(Array.from(candidateMap.values()))) {
      for (const [d, label] of candidateMap) {
        const key = d.id || d.assetPath || '';
        resultMap.set(key, label);
      }
      return;
    }
  }

  // Try Level 3: Extend with both HDR and Video Codec
  {
    const candidateMap = new Map<MediaVersionDescriptor, string>();
    for (const d of group) {
      const hdr = d.hdrFormat || '';
      const codec = d.videoCodec || '';
      const extra = [hdr, codec].filter(Boolean).join(' ');
      const label = extra ? `${baseLabel} ${extra}` : baseLabel;
      candidateMap.set(d, label);
    }
    if (allDistinct(Array.from(candidateMap.values()))) {
      for (const [d, label] of candidateMap) {
        const key = d.id || d.assetPath || '';
        resultMap.set(key, label);
      }
      return;
    }
  }

  // Try Level 4: Extend with Audio Codec / Channels
  const hasAudioDifferences =
    new Set(group.map((d) => normalizeAudio(d.audioCodec, d.audioChannels) || '')).size > 1;
  if (hasAudioDifferences) {
    const candidateMap = new Map<MediaVersionDescriptor, string>();
    for (const d of group) {
      const audio = normalizeAudio(d.audioCodec, d.audioChannels);
      const label = audio ? `${baseLabel} ${audio}` : baseLabel;
      candidateMap.set(d, label);
    }
    if (allDistinct(Array.from(candidateMap.values()))) {
      for (const [d, label] of candidateMap) {
        const key = d.id || d.assetPath || '';
        resultMap.set(key, label);
      }
      return;
    }
  }

  // Try Level 5: Extend with Release Group
  const hasReleaseGroupDifferences = new Set(group.map((d) => d.releaseGroup || '')).size > 1;
  if (hasReleaseGroupDifferences) {
    const candidateMap = new Map<MediaVersionDescriptor, string>();
    for (const d of group) {
      const rg = d.releaseGroup;
      const label = rg ? `${baseLabel} ${rg}` : baseLabel;
      candidateMap.set(d, label);
    }
    if (allDistinct(Array.from(candidateMap.values()))) {
      for (const [d, label] of candidateMap) {
        const key = d.id || d.assetPath || '';
        resultMap.set(key, label);
      }
      return;
    }
  }

  // Fallback: Deterministic Index based on stable sort (assetPath or ID)
  const sorted = [...group].sort((a, b) => {
    const aKey = a.assetPath || a.id || '';
    const bKey = b.assetPath || b.id || '';
    return aKey.localeCompare(bKey);
  });

  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i];
    if (!d) continue;
    const key = d.id || d.assetPath || '';
    resultMap.set(key, `${baseLabel} (${i + 1})`);
  }
}

function allDistinct(items: string[]): boolean {
  return new Set(items).size === items.length;
}
