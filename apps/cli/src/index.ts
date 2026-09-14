import { defaultSystemService, type SystemService } from '@medialoom/core';

export interface CliStreams {
  stdout: { write: (chunk: string) => unknown };
  stderr: { write: (chunk: string) => unknown };
}

export async function runCli(
  args: string[],
  streams: CliStreams = process,
  systemService: SystemService = defaultSystemService,
): Promise<number> {
  const flags = new Set<string>();
  const positional: string[] = [];

  for (const arg of args) {
    if (arg.startsWith('-')) {
      flags.add(arg);
    } else {
      positional.push(arg);
    }
  }

  const isJson = flags.has('--json');
  const isHelp = flags.has('--help') || flags.has('-h') || positional[0] === 'help';
  const isVersion = flags.has('--version') || flags.has('-v') || positional[0] === 'version';
  const command = positional[0];

  if (isHelp || (!command && !isVersion)) {
    streams.stdout.write(
      [
        'MediaLoom - Headless-first, type-safe media library manager',
        '',
        'Usage:',
        '  medialoom <command> [options]',
        '',
        'Commands:',
        '  version             Display MediaLoom version',
        '  doctor              Run environment and system diagnostics',
        '  help                Show help information',
        '',
        'Options:',
        '  --help, -h          Show help information',
        '  --version, -v       Display MediaLoom version',
        '  --json              Output machine-readable JSON envelope',
        '  --no-input          Disable interactive prompts',
        '',
      ].join('\n'),
    );
    return 0;
  }

  if (isVersion) {
    const version = systemService.getVersion();
    if (isJson) {
      streams.stdout.write(`${JSON.stringify({ schemaVersion: 1, version }, null, 2)}\n`);
    } else {
      streams.stdout.write(`medialoom ${version}\n`);
    }
    return 0;
  }

  if (command === 'doctor') {
    const report = await systemService.getDoctorReport();
    if (isJson) {
      streams.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      const lines: string[] = [
        `MediaLoom Diagnostics (v${report.version})`,
        `Status: ${report.status.toUpperCase()}`,
        `Timestamp: ${report.timestamp}`,
        '',
        'Checks:',
      ];
      for (const check of report.checks) {
        const symbol = check.status === 'ok' ? '✓' : check.status === 'warn' ? '!' : '✗';
        lines.push(`  [${symbol}] ${check.name}: ${check.message}`);
      }
      lines.push('');
      streams.stdout.write(lines.join('\n'));
    }
    return report.status === 'error' ? 1 : 0;
  }

  streams.stderr.write(`Unknown command: ${command}. Use --help to view available commands.\n`);
  return 1;
}
