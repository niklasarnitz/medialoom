import { describe, expect, it } from 'bun:test';
import {
  FfprobeAdapter,
  FfprobeExecutionError,
  FfprobeInvalidMediaError,
  FfprobeNotFoundError,
  FfprobeParseError,
  type FfprobeRunner,
  FfprobeTimeoutError,
} from '../src';

class MockFfprobeRunner implements FfprobeRunner {
  private outputOrError: string | Error;

  constructor(outputOrError: string | Error) {
    this.outputOrError = outputOrError;
  }

  async probe(_filePath: string): Promise<string> {
    if (this.outputOrError instanceof Error) {
      throw this.outputOrError;
    }
    return this.outputOrError;
  }
}

describe('FfprobeAdapter', () => {
  it('parses and normalizes a valid video file with single audio stream', async () => {
    const mockJson = JSON.stringify({
      streams: [
        {
          index: 0,
          codec_name: 'h264',
          codec_long_name: 'H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10',
          codec_type: 'video',
          profile: 'High',
          width: 1920,
          height: 1080,
          r_frame_rate: '24/1',
          avg_frame_rate: '24/1',
          pix_fmt: 'yuv420p',
          bits_per_raw_sample: '8',
          disposition: { default: 1 },
        },
        {
          index: 1,
          codec_name: 'aac',
          codec_long_name: 'AAC (Advanced Audio Coding)',
          codec_type: 'audio',
          profile: 'LC',
          channels: 2,
          channel_layout: 'stereo',
          sample_rate: '48000',
          bit_rate: '192000',
          disposition: { default: 1 },
          tags: { language: 'eng', title: 'Stereo' },
        },
      ],
      format: {
        format_name: 'matroska,webm',
        duration: '7200.500000',
        size: '5000000000',
        bit_rate: '5555555',
      },
    });

    const adapter = new FfprobeAdapter(new MockFfprobeRunner(mockJson));
    const result = await adapter.inspect('/path/to/movie.mkv');

    expect(result.container).toBe('matroska');
    expect(result.formatName).toBe('matroska,webm');
    expect(result.durationSeconds).toBe(7200.5);
    expect(result.bitRate).toBe(5555555);
    expect(result.sizeBytes).toBe(5000000000);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.videoCodec).toBe('h264');
    expect(result.frameRate).toBe(24);
    expect(result.bitDepth).toBe(8);
    expect(result.hdrFormat).toBeNull();

    expect(result.audioCodec).toBe('aac');
    expect(result.audioChannels).toBe(2);
    expect(result.audioLanguage).toBe('English');
    expect(result.audioLayout).toBe('stereo');

    expect(result.videoStreams).toHaveLength(1);
    expect(result.audioStreams).toHaveLength(1);
    expect(result.subtitleStreams).toHaveLength(0);
    expect(result.allStreams).toHaveLength(2);
    expect(result.rawJson).toBe(mockJson);
  });

  it('normalizes multiple audio streams and subtitle streams', async () => {
    const mockJson = JSON.stringify({
      streams: [
        {
          index: 0,
          codec_name: 'hevc',
          codec_long_name: 'HEVC / H.265',
          codec_type: 'video',
          profile: 'Main 10',
          width: 3840,
          height: 2160,
          r_frame_rate: '24000/1001',
          avg_frame_rate: '24000/1001',
          pix_fmt: 'yuv420p10le',
          bits_per_raw_sample: '10',
          color_transfer: 'smpte2084',
          color_primaries: 'bt2020',
          color_space: 'bt2020nc',
          side_data_list: [
            {
              side_data_type: 'Mastering display metadata',
            },
          ],
        },
        {
          index: 1,
          codec_name: 'truehd',
          codec_long_name: 'Dolby TrueHD',
          codec_type: 'audio',
          channels: 8,
          channel_layout: '7.1',
          sample_rate: '48000',
          disposition: { default: 1 },
          tags: { language: 'eng', title: 'TrueHD 7.1' },
        },
        {
          index: 2,
          codec_name: 'ac3',
          codec_long_name: 'ATSC A/52A (AC-3)',
          codec_type: 'audio',
          channels: 6,
          channel_layout: '5.1(side)',
          sample_rate: '48000',
          disposition: { default: 0 },
          tags: { language: 'deu', title: 'German AC3 5.1' },
        },
        {
          index: 3,
          codec_name: 'subrip',
          codec_long_name: 'SubRip subtitle',
          codec_type: 'subtitle',
          disposition: { default: 1, forced: 0 },
          tags: { language: 'eng', title: 'English Full' },
        },
        {
          index: 4,
          codec_name: 'subrip',
          codec_long_name: 'SubRip subtitle',
          codec_type: 'subtitle',
          disposition: { default: 0, forced: 1 },
          tags: { language: 'eng', title: 'English Forced' },
        },
      ],
      format: {
        format_name: 'matroska,webm',
        duration: '5400.123',
        size: '12000000000',
        bit_rate: '15000000',
      },
    });

    const adapter = new FfprobeAdapter(new MockFfprobeRunner(mockJson));
    const result = await adapter.inspect('/path/to/movie.mkv');

    expect(result.width).toBe(3840);
    expect(result.height).toBe(2160);
    expect(result.videoCodec).toBe('hevc');
    expect(result.frameRate).toBe(23.976);
    expect(result.bitDepth).toBe(10);
    expect(result.hdrFormat).toBe('HDR10');

    expect(result.audioStreams).toHaveLength(2);
    expect(result.audioStreams[0]?.codec).toBe('truehd');
    expect(result.audioStreams[0]?.channels).toBe(8);
    expect(result.audioStreams[0]?.channelLayout).toBe('7.1');
    expect(result.audioStreams[0]?.isDefault).toBe(true);
    expect(result.audioStreams[0]?.language).toBe('English');

    expect(result.audioStreams[1]?.codec).toBe('ac3');
    expect(result.audioStreams[1]?.channels).toBe(6);
    expect(result.audioStreams[1]?.language).toBe('German');
    expect(result.audioStreams[1]?.isDefault).toBe(false);

    expect(result.subtitleStreams).toHaveLength(2);
    expect(result.subtitleStreams[0]?.title).toBe('English Full');
    expect(result.subtitleStreams[0]?.isDefault).toBe(true);
    expect(result.subtitleStreams[0]?.isForced).toBe(false);

    expect(result.subtitleStreams[1]?.title).toBe('English Forced');
    expect(result.subtitleStreams[1]?.isDefault).toBe(false);
    expect(result.subtitleStreams[1]?.isForced).toBe(true);
  });

  it('detects Dolby Vision and HDR10+ indicators', async () => {
    const doviHdr10Json = JSON.stringify({
      streams: [
        {
          index: 0,
          codec_name: 'hevc',
          codec_type: 'video',
          color_transfer: 'smpte2084',
          color_primaries: 'bt2020',
          side_data_list: [
            {
              side_data_type: 'DOVI configuration record',
              dv_profile: 8,
              dv_level: 6,
            },
            {
              side_data_type: 'Mastering display metadata',
            },
          ],
        },
      ],
      format: { format_name: 'matroska', duration: '100' },
    });

    const adapter1 = new FfprobeAdapter(new MockFfprobeRunner(doviHdr10Json));
    const result1 = await adapter1.inspect('/path/to/dovi.mkv');
    expect(result1.hdrFormat).toBe('Dolby Vision / HDR10');

    const hlgJson = JSON.stringify({
      streams: [
        {
          index: 0,
          codec_name: 'hevc',
          codec_type: 'video',
          color_transfer: 'arib-std-b67',
        },
      ],
      format: { format_name: 'mp4', duration: '50' },
    });

    const adapter2 = new FfprobeAdapter(new MockFfprobeRunner(hlgJson));
    const result2 = await adapter2.inspect('/path/to/hlg.mp4');
    expect(result2.hdrFormat).toBe('HLG');
  });

  it('throws FfprobeParseError on malformed JSON', async () => {
    const adapter = new FfprobeAdapter(new MockFfprobeRunner('invalid { json string'));
    expect(adapter.inspect('/path/to/bad.mkv')).rejects.toBeInstanceOf(FfprobeParseError);
  });

  it('throws FfprobeInvalidMediaError when output contains no streams and no format', async () => {
    const emptyJson = JSON.stringify({ streams: [] });
    const adapter = new FfprobeAdapter(new MockFfprobeRunner(emptyJson));
    expect(adapter.inspect('/path/to/empty.mkv')).rejects.toBeInstanceOf(FfprobeInvalidMediaError);
  });

  it('propagates FfprobeNotFoundError, FfprobeTimeoutError, and FfprobeExecutionError', async () => {
    const notFoundAdapter = new FfprobeAdapter(
      new MockFfprobeRunner(new FfprobeNotFoundError('Executable missing')),
    );
    expect(notFoundAdapter.inspect('/path/to/any.mkv')).rejects.toBeInstanceOf(
      FfprobeNotFoundError,
    );

    const timeoutAdapter = new FfprobeAdapter(
      new MockFfprobeRunner(new FfprobeTimeoutError('Probe timed out')),
    );
    expect(timeoutAdapter.inspect('/path/to/any.mkv')).rejects.toBeInstanceOf(FfprobeTimeoutError);

    const execAdapter = new FfprobeAdapter(
      new MockFfprobeRunner(new FfprobeExecutionError('Exit code 1', 1, 'Corrupt data')),
    );
    expect(execAdapter.inspect('/path/to/any.mkv')).rejects.toBeInstanceOf(FfprobeExecutionError);
  });
});
