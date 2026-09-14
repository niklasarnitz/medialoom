import { DefaultFfprobeRunner, type FfprobeRunner } from './ffprobe-runner';
import {
  FfprobeInvalidMediaError,
  FfprobeParseError,
  type NormalizedAudioStream,
  type NormalizedStream,
  type NormalizedSubtitleStream,
  type NormalizedTechnicalMetadata,
  type NormalizedVideoStream,
  type RawFfprobeOutput,
  type RawFfprobeStream,
  rawFfprobeOutputSchema,
} from './types';

function parseRational(val: string | undefined): number | null {
  if (!val) return null;
  const parts = val.split('/');
  const part0 = parts[0];
  const part1 = parts[1];
  if (part0 !== undefined && part1 !== undefined) {
    const num = Number.parseFloat(part0);
    const den = Number.parseFloat(part1);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
      const result = num / den;
      return Math.round(result * 1000) / 1000;
    }
  }
  const parsed = Number.parseFloat(val);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(val: string | number | undefined): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.trunc(val) : null;
  }
  const parsed = Number.parseInt(val, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseFloatNumber(val: string | number | undefined): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  const parsed = Number.parseFloat(val);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseBitDepth(stream: RawFfprobeStream): number | null {
  // 1. Explicit bits_per_raw_sample
  const rawSample = parseInteger(stream.bits_per_raw_sample);
  if (rawSample && rawSample > 0) {
    return rawSample;
  }

  // 2. Derive from pixel format
  if (stream.pix_fmt) {
    const fmt = stream.pix_fmt.toLowerCase();
    if (
      fmt.includes('10le') ||
      fmt.includes('10be') ||
      fmt.includes('p10') ||
      fmt.includes('10bit')
    ) {
      return 10;
    }
    if (
      fmt.includes('12le') ||
      fmt.includes('12be') ||
      fmt.includes('p12') ||
      fmt.includes('12bit')
    ) {
      return 12;
    }
    if (
      fmt.includes('16le') ||
      fmt.includes('16be') ||
      fmt.includes('p16') ||
      fmt.includes('16bit')
    ) {
      return 16;
    }
    if (
      fmt.includes('yuv420p') ||
      fmt.includes('yuv422p') ||
      fmt.includes('yuv444p') ||
      fmt.includes('yuvj420p') ||
      fmt.includes('rgb24') ||
      fmt.includes('bgr24') ||
      fmt.includes('rgba') ||
      fmt.includes('bgra')
    ) {
      return 8;
    }
  }

  // 3. Fallback to bits_per_sample
  const sample = parseInteger(stream.bits_per_sample);
  if (sample && sample > 0) {
    return sample;
  }

  return null;
}

function detectHdrFormat(stream: RawFfprobeStream): string | null {
  const sideDataTypes: string[] = (stream.side_data_list ?? []).map((sd) =>
    String(sd.side_data_type || '').toLowerCase(),
  );

  const hasDoviSideData = sideDataTypes.some(
    (t: string) => t.includes('dovi') || t.includes('dolby vision'),
  );

  const hasDoviTag = Boolean(
    stream.codec_tag_string && /^(dvh|dvhe|dva|dvav)/i.test(stream.codec_tag_string),
  );

  const hasDoviProfile = Boolean(stream.profile && /dolby\s*vision/i.test(stream.profile));

  const isDolbyVision = hasDoviSideData || hasDoviTag || hasDoviProfile;

  const isHdr10Plus = sideDataTypes.some((t: string) => t.includes('hdr10+'));

  const isPq = stream.color_transfer === 'smpte2084';
  const isBt2020 = stream.color_primaries === 'bt2020' || stream.color_space?.includes('bt2020');
  const hasMasteringDisplay = sideDataTypes.some(
    (t: string) => t.includes('mastering display') || t.includes('content light level'),
  );
  const isHdr10 = isPq || (isBt2020 && hasMasteringDisplay);

  const isHlg = stream.color_transfer === 'arib-std-b67';

  if (isDolbyVision) {
    if (isHdr10Plus) return 'Dolby Vision / HDR10+';
    if (isHdr10) return 'Dolby Vision / HDR10';
    return 'Dolby Vision';
  }

  if (isHdr10Plus) return 'HDR10+';
  if (isHdr10) return 'HDR10';
  if (isHlg) return 'HLG';

  return null;
}

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

function resolveLanguageName(code: string | undefined): string | null {
  if (!code || typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (!trimmed) return null;

  try {
    const resolved = languageNames.of(trimmed);
    if (resolved && resolved.length > 0) {
      return resolved;
    }
  } catch {
    // Ignore invalid code formatting
  }
  return trimmed;
}

function normalizeContainer(formatName: string | undefined): string | null {
  if (!formatName) return null;
  const formats = formatName.toLowerCase().split(',');
  if (formats.includes('matroska') || formats.includes('mkv')) return 'matroska';
  if (formats.includes('mov') || formats.includes('mp4') || formats.includes('m4a')) return 'mp4';
  if (formats.includes('avi')) return 'avi';
  return formats[0] ?? formatName;
}

export class FfprobeAdapter {
  private runner: FfprobeRunner;

  constructor(runner?: FfprobeRunner) {
    this.runner = runner ?? new DefaultFfprobeRunner();
  }

  async inspect(filePath: string): Promise<NormalizedTechnicalMetadata> {
    const rawOutput = await this.runner.probe(filePath);

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawOutput);
    } catch (err) {
      throw new FfprobeParseError(`Failed to parse ffprobe output as JSON for "${filePath}"`, {
        cause: err,
      });
    }

    const validated = rawFfprobeOutputSchema.safeParse(parsedJson);
    if (!validated.success) {
      throw new FfprobeParseError(
        `ffprobe output did not match expected schema: ${validated.error.message}`,
      );
    }

    return this.normalize(validated.data, rawOutput);
  }

  normalize(data: RawFfprobeOutput, rawJson: string): NormalizedTechnicalMetadata {
    const format = data.format;
    const streams = data.streams ?? [];

    if (streams.length === 0 && !format?.duration && !format?.format_name) {
      throw new FfprobeInvalidMediaError('ffprobe returned no stream or format metadata.');
    }

    const videoStreams: NormalizedVideoStream[] = [];
    const audioStreams: NormalizedAudioStream[] = [];
    const subtitleStreams: NormalizedSubtitleStream[] = [];
    const allStreams: NormalizedStream[] = [];

    for (const stream of streams) {
      const codecType = (stream.codec_type || '').toLowerCase();
      const codec = stream.codec_name ?? null;
      const codecLongName = stream.codec_long_name ?? null;
      const profile = stream.profile ?? null;
      const bitRate = parseInteger(stream.bit_rate);

      if (codecType === 'video') {
        const width = stream.width ?? null;
        const height = stream.height ?? null;
        const frameRate =
          parseRational(stream.avg_frame_rate) ?? parseRational(stream.r_frame_rate);
        const bitDepth = parseBitDepth(stream);
        const hdrFormat = detectHdrFormat(stream);

        const vStream: NormalizedVideoStream = {
          index: stream.index,
          codec,
          codecLongName,
          profile,
          width,
          height,
          frameRate,
          bitDepth,
          hdrFormat,
          bitRate,
        };
        videoStreams.push(vStream);
        allStreams.push({
          index: stream.index,
          streamType: 'VIDEO',
          codec,
          codecLongName,
          profile,
          width,
          height,
          frameRate,
          bitDepth,
          hdrFormat,
          bitRate,
        });
      } else if (codecType === 'audio') {
        const channels = stream.channels ?? null;
        const channelLayout = stream.channel_layout ?? null;
        const sampleRate = parseInteger(stream.sample_rate);
        const language = resolveLanguageName(stream.tags?.language as string | undefined);
        const title = (stream.tags?.title as string | undefined) ?? null;
        const isDefault = Number(stream.disposition?.default) === 1;

        const aStream: NormalizedAudioStream = {
          index: stream.index,
          codec,
          codecLongName,
          profile,
          channels,
          channelLayout,
          sampleRate,
          bitRate,
          language,
          title,
          isDefault,
        };
        audioStreams.push(aStream);
        allStreams.push({
          index: stream.index,
          streamType: 'AUDIO',
          codec,
          codecLongName,
          profile,
          channels,
          channelLayout,
          sampleRate,
          bitRate,
          language,
          title,
          isDefault,
        });
      } else if (codecType === 'subtitle') {
        const language = resolveLanguageName(stream.tags?.language as string | undefined);
        const title = (stream.tags?.title as string | undefined) ?? null;
        const isDefault = Number(stream.disposition?.default) === 1;
        const isForced = Number(stream.disposition?.forced) === 1;

        const sStream: NormalizedSubtitleStream = {
          index: stream.index,
          codec,
          codecLongName,
          language,
          title,
          isDefault,
          isForced,
        };
        subtitleStreams.push(sStream);
        allStreams.push({
          index: stream.index,
          streamType: 'SUBTITLE',
          codec,
          codecLongName,
          profile,
          language,
          title,
          isDefault,
          isForced,
        });
      } else {
        allStreams.push({
          index: stream.index,
          streamType: 'OTHER',
          codec,
          codecLongName,
          profile,
          bitRate,
        });
      }
    }

    // Top-level summary: primary video & audio
    const primaryVideo = videoStreams[0];
    const primaryAudio = audioStreams.find((a) => a.isDefault) ?? audioStreams[0];

    const container = normalizeContainer(format?.format_name);
    const formatName = format?.format_name ?? null;
    const durationSeconds = parseFloatNumber(format?.duration);
    const bitRate = parseInteger(format?.bit_rate);
    const sizeBytes = parseInteger(format?.size);

    return {
      container,
      formatName,
      durationSeconds,
      bitRate,
      sizeBytes,
      width: primaryVideo?.width ?? null,
      height: primaryVideo?.height ?? null,
      videoCodec: primaryVideo?.codec ?? null,
      frameRate: primaryVideo?.frameRate ?? null,
      bitDepth: primaryVideo?.bitDepth ?? null,
      hdrFormat: primaryVideo?.hdrFormat ?? null,
      audioCodec: primaryAudio?.codec ?? null,
      audioChannels: primaryAudio?.channels ?? null,
      audioLanguage: primaryAudio?.language ?? null,
      audioLayout: primaryAudio?.channelLayout ?? null,
      videoStreams,
      audioStreams,
      subtitleStreams,
      allStreams,
      rawJson,
    };
  }
}

export const defaultFfprobeAdapter = new FfprobeAdapter();

export function inspectMediaFile(filePath: string): Promise<NormalizedTechnicalMetadata> {
  return defaultFfprobeAdapter.inspect(filePath);
}
