import { describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { doctorReportEnvelopeSchema } from '@medialoom/contracts';
import { runCli } from '../src';

describe('medialoom CLI', () => {
  it('handles --help flag', async () => {
    let stdout = '';
    let stderr = '';
    const code = await runCli(['--help'], {
      stdout: {
        write: (c) => {
          stdout += c;
        },
      },
      stderr: {
        write: (c) => {
          stderr += c;
        },
      },
    });

    expect(code).toBe(0);
    expect(stdout).toContain('MediaLoom');
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('doctor');
    expect(stderr).toBe('');
  });

  it('handles version command', async () => {
    let stdout = '';
    let stderr = '';
    const code = await runCli(['version'], {
      stdout: {
        write: (c) => {
          stdout += c;
        },
      },
      stderr: {
        write: (c) => {
          stderr += c;
        },
      },
    });

    expect(code).toBe(0);
    expect(stdout).toBe('medialoom 0.1.0\n');
    expect(stderr).toBe('');
  });

  it('handles doctor command in human mode', async () => {
    let stdout = '';
    let stderr = '';
    const code = await runCli(['doctor'], {
      stdout: {
        write: (c) => {
          stdout += c;
        },
      },
      stderr: {
        write: (c) => {
          stderr += c;
        },
      },
    });

    expect(code).toBe(0);
    expect(stdout).toContain('MediaLoom Diagnostics');
    expect(stdout).toContain('Checks:');
    expect(stderr).toBe('');
  });

  it('handles doctor --json by emitting a valid versioned envelope', async () => {
    let stdout = '';
    let stderr = '';
    const code = await runCli(['doctor', '--json'], {
      stdout: {
        write: (c) => {
          stdout += c;
        },
      },
      stderr: {
        write: (c) => {
          stderr += c;
        },
      },
    });

    expect(code).toBe(0);
    expect(stderr).toBe('');

    // Must parse directly as JSON
    const parsed = JSON.parse(stdout);
    const validated = doctorReportEnvelopeSchema.parse(parsed);

    expect(validated.schemaVersion).toBe(1);
    expect(validated.version).toBe('0.1.0');
    expect(Array.isArray(validated.checks)).toBe(true);
    expect(validated.checks.some((c) => c.name === 'database')).toBe(true);
  });

  it('executes as a standalone binary and outputs only valid JSON to stdout for doctor --json', () => {
    const result = spawnSync('bun', ['apps/cli/bin/medialoom.ts', 'doctor', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    const rawStdout = result.stdout.trim();
    expect(rawStdout.startsWith('{')).toBe(true);
    expect(rawStdout.endsWith('}')).toBe(true);

    const parsed = JSON.parse(rawStdout);
    const validated = doctorReportEnvelopeSchema.parse(parsed);
    expect(validated.schemaVersion).toBe(1);
  });
});
