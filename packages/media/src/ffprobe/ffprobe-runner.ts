import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  FfprobeError,
  FfprobeExecutionError,
  FfprobeInvalidMediaError,
  FfprobeNotFoundError,
  FfprobePermissionError,
  FfprobeTimeoutError,
} from './types';

const execFileAsync = promisify(execFile);

export interface FfprobeRunner {
  probe(filePath: string): Promise<string>;
}

export interface FfprobeRunnerOptions {
  executablePath?: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
}

export class DefaultFfprobeRunner implements FfprobeRunner {
  private executablePath: string;
  private timeoutMs: number;
  private maxBufferBytes: number;

  constructor(options: FfprobeRunnerOptions = {}) {
    this.executablePath = options.executablePath ?? 'ffprobe';
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.maxBufferBytes = options.maxBufferBytes ?? 15 * 1024 * 1024;
  }

  async probe(filePath: string): Promise<string> {
    const args = [
      '-v',
      'error',
      '-show_format',
      '-show_streams',
      '-print_format',
      'json',
      filePath,
    ];

    try {
      const { stdout } = await execFileAsync(this.executablePath, args, {
        timeout: this.timeoutMs,
        maxBuffer: this.maxBufferBytes,
        encoding: 'utf-8',
      });
      return stdout;
    } catch (err: unknown) {
      if (err instanceof FfprobeError) {
        throw err;
      }

      const nodeErr = err as {
        code?: string | number;
        killed?: boolean;
        signal?: string;
        stderr?: string;
        message?: string;
      };

      const stderr = typeof nodeErr.stderr === 'string' ? nodeErr.stderr.trim() : '';

      if (nodeErr.code === 'ENOENT') {
        throw new FfprobeNotFoundError(
          `ffprobe executable "${this.executablePath}" was not found. Please ensure FFmpeg/ffprobe is installed.`,
          { cause: err },
        );
      }

      if (nodeErr.code === 'EACCES') {
        throw new FfprobePermissionError(
          `Permission denied when executing ffprobe or reading "${filePath}".`,
          { cause: err },
        );
      }

      if (nodeErr.killed || nodeErr.code === 'ETIMEDOUT' || nodeErr.signal === 'SIGTERM') {
        throw new FfprobeTimeoutError(
          `ffprobe inspection of "${filePath}" timed out after ${this.timeoutMs}ms.`,
          { cause: err },
        );
      }

      const exitCode = typeof nodeErr.code === 'number' ? nodeErr.code : null;

      // Classify known corrupt / invalid media error messages
      const isCorruptOrInvalid =
        stderr.includes('Invalid data found when processing input') ||
        stderr.includes('EBML header parsing failed') ||
        stderr.includes('moov atom not found') ||
        stderr.includes('could not find codec parameters') ||
        stderr.includes('does not contain any stream') ||
        stderr.includes('Format not recognized') ||
        stderr.includes('Invalid argument');

      if (isCorruptOrInvalid) {
        throw new FfprobeInvalidMediaError(
          `ffprobe could not inspect "${filePath}": media is corrupt, invalid, or unsupported. ${stderr}`,
          { cause: err },
        );
      }

      throw new FfprobeExecutionError(
        `ffprobe failed on "${filePath}" with exit code ${exitCode ?? 'unknown'}: ${stderr || nodeErr.message || 'Unknown error'}`,
        exitCode,
        stderr,
        { cause: err },
      );
    }
  }
}

export const defaultFfprobeRunner = new DefaultFfprobeRunner();
