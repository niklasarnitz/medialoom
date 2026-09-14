import { z } from 'zod';

// ============================================================================
// Raw ffprobe JSON Validation Schemas
// ============================================================================

export const rawFfprobeDispositionSchema = z
  .record(z.union([z.number(), z.string(), z.boolean()]))
  .optional();

export const rawFfprobeTagsSchema = z.record(z.union([z.string(), z.number()])).optional();

export const rawFfprobeSideDataSchema = z
  .object({
    side_data_type: z.string().optional(),
    dv_version_major: z.number().optional(),
    dv_version_minor: z.number().optional(),
    dv_profile: z.number().optional(),
    dv_level: z.number().optional(),
    rpu_present_flag: z.number().optional(),
    el_present_flag: z.number().optional(),
    bl_present_flag: z.number().optional(),
    red_x: z.string().optional(),
    red_y: z.string().optional(),
    green_x: z.string().optional(),
    green_y: z.string().optional(),
    blue_x: z.string().optional(),
    blue_y: z.string().optional(),
    white_point_x: z.string().optional(),
    white_point_y: z.string().optional(),
    min_luminance: z.string().optional(),
    max_luminance: z.string().optional(),
    max_content: z.number().optional(),
    max_average: z.number().optional(),
  })
  .passthrough();

export const rawFfprobeStreamSchema = z
  .object({
    index: z.number(),
    codec_name: z.string().optional(),
    codec_long_name: z.string().optional(),
    profile: z.string().optional(),
    codec_type: z.string().optional(),
    codec_tag_string: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    r_frame_rate: z.string().optional(),
    avg_frame_rate: z.string().optional(),
    pix_fmt: z.string().optional(),
    bits_per_raw_sample: z.union([z.string(), z.number()]).optional(),
    bits_per_sample: z.number().optional(),
    color_range: z.string().optional(),
    color_space: z.string().optional(),
    color_transfer: z.string().optional(),
    color_primaries: z.string().optional(),
    sample_fmt: z.string().optional(),
    sample_rate: z.union([z.string(), z.number()]).optional(),
    channels: z.number().optional(),
    channel_layout: z.string().optional(),
    bit_rate: z.union([z.string(), z.number()]).optional(),
    disposition: rawFfprobeDispositionSchema,
    tags: rawFfprobeTagsSchema,
    side_data_list: z.array(rawFfprobeSideDataSchema).optional(),
  })
  .passthrough();

export type RawFfprobeStream = z.infer<typeof rawFfprobeStreamSchema>;

export const rawFfprobeFormatSchema = z
  .object({
    filename: z.string().optional(),
    format_name: z.string().optional(),
    format_long_name: z.string().optional(),
    duration: z.union([z.string(), z.number()]).optional(),
    size: z.union([z.string(), z.number()]).optional(),
    bit_rate: z.union([z.string(), z.number()]).optional(),
    tags: rawFfprobeTagsSchema,
  })
  .passthrough();

export type RawFfprobeFormat = z.infer<typeof rawFfprobeFormatSchema>;

export const rawFfprobeOutputSchema = z
  .object({
    streams: z.array(rawFfprobeStreamSchema).default([]),
    format: rawFfprobeFormatSchema.optional(),
  })
  .passthrough();

export type RawFfprobeOutput = z.infer<typeof rawFfprobeOutputSchema>;

// ============================================================================
// Normalized Technical Metadata Types
// ============================================================================

export interface NormalizedVideoStream {
  index: number;
  codec: string | null;
  codecLongName: string | null;
  profile: string | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  bitDepth: number | null;
  hdrFormat: string | null;
  bitRate: number | null;
}

export interface NormalizedAudioStream {
  index: number;
  codec: string | null;
  codecLongName: string | null;
  profile: string | null;
  channels: number | null;
  channelLayout: string | null;
  sampleRate: number | null;
  bitRate: number | null;
  language: string | null;
  title: string | null;
  isDefault: boolean;
}

export interface NormalizedSubtitleStream {
  index: number;
  codec: string | null;
  codecLongName: string | null;
  language: string | null;
  title: string | null;
  isDefault: boolean;
  isForced: boolean;
}

export interface NormalizedStream {
  index: number;
  streamType: 'VIDEO' | 'AUDIO' | 'SUBTITLE' | 'OTHER';
  codec: string | null;
  codecLongName: string | null;
  profile: string | null;
  width?: number | null;
  height?: number | null;
  frameRate?: number | null;
  bitDepth?: number | null;
  hdrFormat?: string | null;
  channels?: number | null;
  channelLayout?: string | null;
  sampleRate?: number | null;
  bitRate?: number | null;
  language?: string | null;
  title?: string | null;
  isDefault?: boolean;
  isForced?: boolean;
}

export interface NormalizedTechnicalMetadata {
  container: string | null;
  formatName: string | null;
  durationSeconds: number | null;
  bitRate: number | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  frameRate: number | null;
  bitDepth: number | null;
  hdrFormat: string | null;
  audioCodec: string | null;
  audioChannels: number | null;
  audioLanguage: string | null;
  audioLayout: string | null;
  videoStreams: NormalizedVideoStream[];
  audioStreams: NormalizedAudioStream[];
  subtitleStreams: NormalizedSubtitleStream[];
  allStreams: NormalizedStream[];
  rawJson: string;
}

// ============================================================================
// Error Hierarchy
// ============================================================================

export class FfprobeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FfprobeError';
  }
}

export class FfprobeNotFoundError extends FfprobeError {
  constructor(message = 'ffprobe executable not found on system PATH', options?: ErrorOptions) {
    super(message, options);
    this.name = 'FfprobeNotFoundError';
  }
}

export class FfprobeTimeoutError extends FfprobeError {
  constructor(message = 'ffprobe process timed out', options?: ErrorOptions) {
    super(message, options);
    this.name = 'FfprobeTimeoutError';
  }
}

export class FfprobeExecutionError extends FfprobeError {
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(
    message: string,
    exitCode: number | null = null,
    stderr = '',
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'FfprobeExecutionError';
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export class FfprobeParseError extends FfprobeError {
  constructor(message = 'Failed to parse ffprobe output as JSON', options?: ErrorOptions) {
    super(message, options);
    this.name = 'FfprobeParseError';
  }
}

export class FfprobeInvalidMediaError extends FfprobeError {
  constructor(message = 'File is not a valid or supported media file', options?: ErrorOptions) {
    super(message, options);
    this.name = 'FfprobeInvalidMediaError';
  }
}

export class FfprobePermissionError extends FfprobeError {
  constructor(message = 'Permission denied accessing file for ffprobe', options?: ErrorOptions) {
    super(message, options);
    this.name = 'FfprobePermissionError';
  }
}
