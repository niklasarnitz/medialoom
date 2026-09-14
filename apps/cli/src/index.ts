import {
  defaultInventoryService,
  defaultSystemService,
  type InventoryService,
  type SystemService,
} from '@medialoom/core';

export interface CliStreams {
  stdout: { write: (chunk: string) => unknown };
  stderr: { write: (chunk: string) => unknown };
}

export interface CliServices {
  systemService?: SystemService;
  inventoryService?: InventoryService;
}

function serializeJson(data: unknown): string {
  return JSON.stringify(
    data,
    (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
    2,
  );
}

export async function runCli(
  args: string[],
  streams: CliStreams = process,
  systemOrServices: SystemService | CliServices = defaultSystemService,
  inventoryServiceArg?: InventoryService,
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

  let systemService: SystemService;
  let inventoryService: InventoryService;

  if ('getVersion' in systemOrServices) {
    systemService = systemOrServices;
    inventoryService = inventoryServiceArg ?? defaultInventoryService;
  } else {
    systemService = systemOrServices.systemService ?? defaultSystemService;
    inventoryService = systemOrServices.inventoryService ?? defaultInventoryService;
  }

  if (isHelp || (!command && !isVersion)) {
    streams.stdout.write(
      [
        'MediaLoom - Headless-first, type-safe media library manager',
        '',
        'Usage:',
        '  medialoom <command> [options]',
        '',
        'Commands:',
        '  scan <path>         Recursively scan directory and parse media filenames',
        '  items               List media items in the inventory',
        '  inspect <id>        Inspect details and metadata for a media item',
        '  doctor              Run environment and system diagnostics',
        '  version             Display MediaLoom version',
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
      streams.stdout.write(`${serializeJson({ schemaVersion: 1, version })}\n`);
    } else {
      streams.stdout.write(`medialoom ${version}\n`);
    }
    return 0;
  }

  if (command === 'doctor') {
    const report = await systemService.getDoctorReport();
    if (isJson) {
      streams.stdout.write(`${serializeJson(report)}\n`);
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

  if (command === 'scan') {
    const scanPath = positional[1];
    if (!scanPath) {
      streams.stderr.write('Error: Missing required <path> argument for scan command.\n');
      return 1;
    }

    try {
      const result = await inventoryService.scan(scanPath);
      if (isJson) {
        streams.stdout.write(
          `${serializeJson({
            schemaVersion: 1,
            scanId: result.scanId,
            discovered: result.discovered,
            created: result.created,
            updated: result.updated,
            failed: result.failed,
          })}\n`,
        );
      } else {
        const lines: string[] = [
          'MediaLoom Scan Report',
          `  Scan ID:    ${result.scanId}`,
          `  Discovered: ${result.discovered}`,
          `  Created:    ${result.created}`,
          `  Updated:    ${result.updated}`,
          `  Failed:     ${result.failed}`,
          '',
        ];
        streams.stdout.write(lines.join('\n'));
      }
      return result.failed > 0 ? 1 : 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isJson) {
        streams.stdout.write(`${serializeJson({ schemaVersion: 1, error: message })}\n`);
      } else {
        streams.stderr.write(`Scan error: ${message}\n`);
      }
      return 1;
    }
  }

  if (command === 'items') {
    try {
      const items = await inventoryService.listItems();
      if (isJson) {
        streams.stdout.write(`${serializeJson({ schemaVersion: 1, items })}\n`);
      } else {
        if (items.length === 0) {
          streams.stdout.write('No media items found in library.\n');
        } else {
          const lines: string[] = [
            `Media Items (${items.length} total):`,
            '',
            `${'ID'.padEnd(28)} ${'STATUS'.padEnd(16)} ${'YEAR'.padEnd(6)} TITLE`,
            '-'.repeat(75),
          ];
          for (const item of items) {
            const yearStr = item.year ? String(item.year) : '-';
            lines.push(
              `${item.id.padEnd(28)} ${item.status.padEnd(16)} ${yearStr.padEnd(6)} ${item.title}`,
            );
          }
          lines.push('');
          streams.stdout.write(lines.join('\n'));
        }
      }
      return 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isJson) {
        streams.stdout.write(`${serializeJson({ schemaVersion: 1, error: message })}\n`);
      } else {
        streams.stderr.write(`Failed to list items: ${message}\n`);
      }
      return 1;
    }
  }

  if (command === 'inspect') {
    const itemId = positional[1];
    if (!itemId) {
      streams.stderr.write('Error: Missing required <id> argument for inspect command.\n');
      return 1;
    }

    try {
      const item = await inventoryService.getItem(itemId);
      if (!item) {
        if (isJson) {
          streams.stdout.write(
            `${serializeJson({ schemaVersion: 1, error: `Item "${itemId}" not found` })}\n`,
          );
        } else {
          streams.stderr.write(`Item not found: ${itemId}\n`);
        }
        return 1;
      }

      if (isJson) {
        streams.stdout.write(`${serializeJson({ schemaVersion: 1, item })}\n`);
      } else {
        const lines: string[] = [
          `MediaItem: ${item.title} ${item.year ? `(${item.year})` : ''}`,
          `  ID:     ${item.id}`,
          `  Status: ${item.status}`,
        ];
        if (item.tmdbId) lines.push(`  TMDb ID: ${item.tmdbId}`);
        if (item.imdbId) lines.push(`  IMDb ID: ${item.imdbId}`);

        lines.push('', '  Editions:');
        for (const edition of item.editions) {
          lines.push(`    - Edition: ${edition.name || 'Standard'} (ID: ${edition.id})`);
          for (const version of edition.mediaVersions) {
            lines.push(`      - Version: ${version.name || 'Default'} (ID: ${version.id})`);
            for (const asset of version.assets) {
              lines.push(
                `        - Asset: ${asset.path} [${asset.present ? 'PRESENT' : 'MISSING'}]`,
              );
              lines.push(
                `          Size: ${(Number(asset.sizeBytes) / (1024 * 1024)).toFixed(2)} MB`,
              );
              if (asset.filenameMetadata) {
                const fn = asset.filenameMetadata;
                lines.push('          Filename Metadata:');
                if (fn.title) lines.push(`            Title:         ${fn.title}`);
                if (fn.year) lines.push(`            Year:          ${fn.year}`);
                if (fn.screenSize) lines.push(`            Screen Size:   ${fn.screenSize}`);
                if (fn.source) lines.push(`            Source:        ${fn.source}`);
                if (fn.videoCodec) lines.push(`            Video Codec:   ${fn.videoCodec}`);
                if (fn.audioCodec) lines.push(`            Audio Codec:   ${fn.audioCodec}`);
                if (fn.audioChannels) lines.push(`            Channels:      ${fn.audioChannels}`);
                if (fn.releaseGroup) lines.push(`            Release Group: ${fn.releaseGroup}`);
              }
            }
          }
        }
        lines.push('');
        streams.stdout.write(lines.join('\n'));
      }
      return 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isJson) {
        streams.stdout.write(`${serializeJson({ schemaVersion: 1, error: message })}\n`);
      } else {
        streams.stderr.write(`Failed to inspect item: ${message}\n`);
      }
      return 1;
    }
  }

  streams.stderr.write(`Unknown command: ${command}. Use --help to view available commands.\n`);
  return 1;
}
