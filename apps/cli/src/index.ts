import {
  defaultInventoryService,
  defaultMetadataService,
  defaultSystemService,
  type InventoryService,
  type MetadataService,
  type SystemService,
} from '@medialoom/core';

export interface CliStreams {
  stdout: { write: (chunk: string) => unknown };
  stderr: { write: (chunk: string) => unknown };
}

export interface CliServices {
  systemService?: SystemService;
  inventoryService?: InventoryService;
  metadataService?: MetadataService;
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
  let metadataService: MetadataService;

  if ('getVersion' in systemOrServices) {
    systemService = systemOrServices;
    inventoryService = inventoryServiceArg ?? defaultInventoryService;
    metadataService = defaultMetadataService;
  } else {
    systemService = systemOrServices.systemService ?? defaultSystemService;
    inventoryService = systemOrServices.inventoryService ?? defaultInventoryService;
    metadataService = systemOrServices.metadataService ?? defaultMetadataService;
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
        '  candidates <id>     Search TMDb for candidate metadata for an item',
        '  config get [key]    Get configuration setting from database',
        '  config set <key> <v> Set configuration setting in SQLite database',
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
              if (asset.technicalMetadata) {
                const tech = asset.technicalMetadata;
                lines.push('          Technical Metadata:');
                if (tech.container) lines.push(`            Container:     ${tech.container}`);
                if (tech.durationSeconds)
                  lines.push(`            Duration:      ${Math.round(tech.durationSeconds)}s`);
                if (tech.width && tech.height)
                  lines.push(`            Resolution:    ${tech.width}x${tech.height}`);
                if (tech.videoCodec) lines.push(`            Video Codec:   ${tech.videoCodec}`);
                if (tech.frameRate) lines.push(`            Frame Rate:    ${tech.frameRate} fps`);
                if (tech.bitDepth) lines.push(`            Bit Depth:     ${tech.bitDepth}-bit`);
                if (tech.hdrFormat) lines.push(`            HDR:           ${tech.hdrFormat}`);
                if (tech.audioCodec) lines.push(`            Audio Codec:   ${tech.audioCodec}`);
                if (tech.audioChannels)
                  lines.push(`            Channels:      ${tech.audioChannels}`);
                if (tech.audioLanguage)
                  lines.push(`            Audio Lang:    ${tech.audioLanguage}`);
                if (tech.streams && tech.streams.length > 0) {
                  lines.push(`            Streams (${tech.streams.length}):`);
                  for (const s of tech.streams) {
                    const details = [
                      s.codec,
                      s.width && s.height ? `${s.width}x${s.height}` : null,
                      s.channels ? `${s.channels}ch` : null,
                      s.channelLayout,
                      s.language,
                      s.isDefault ? 'default' : null,
                      s.isForced ? 'forced' : null,
                    ]
                      .filter(Boolean)
                      .join(', ');
                    lines.push(`              #${s.index} [${s.streamType}]: ${details}`);
                  }
                }
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

  if (command === 'candidates') {
    const itemId = positional[1];
    if (!itemId) {
      if (isJson) {
        streams.stdout.write(
          `${serializeJson({ schemaVersion: 1, error: 'Missing required <id> argument for candidates command.' })}\n`,
        );
      } else {
        streams.stderr.write('Error: Missing required <id> argument for candidates command.\n');
      }
      return 1;
    }

    try {
      const result = await metadataService.getCandidatesForItem(itemId);
      if (isJson) {
        streams.stdout.write(
          `${serializeJson({
            schemaVersion: 1,
            itemId: result.item.id,
            query: result.query,
            year: result.year,
            candidates: result.candidates,
          })}\n`,
        );
      } else {
        const lines: string[] = [
          `MediaItem: ${result.item.title}${result.year ? ` (${result.year})` : ''} [ID: ${result.item.id}]`,
          `Query: "${result.query}"${result.year ? ` (Year: ${result.year})` : ''}`,
          '',
        ];
        if (result.candidates.length === 0) {
          lines.push(`No candidates found for "${result.query}".`);
        } else {
          lines.push(`Candidates (${result.candidates.length} found):`);
          lines.push('');
          for (const [i, c] of result.candidates.entries()) {
            const yearStr = c.year ? ` (${c.year})` : '';
            lines.push(
              `  [${i + 1}] [${c.provider.toUpperCase()} ${c.providerId}] ${c.title}${yearStr}`,
            );
            if (c.overview) {
              const truncated =
                c.overview.length > 120 ? `${c.overview.slice(0, 117)}...` : c.overview;
              lines.push(`      Overview: ${truncated}`);
            }
            if (c.posterUrl) {
              lines.push(`      Poster:   ${c.posterUrl}`);
            }
            lines.push('');
          }
        }
        streams.stdout.write(lines.join('\n'));
      }
      return 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isJson) {
        streams.stdout.write(`${serializeJson({ schemaVersion: 1, error: message })}\n`);
      } else {
        streams.stderr.write(`Candidates error: ${message}\n`);
      }
      return 1;
    }
  }

  if (command === 'config') {
    const subCommand = positional[1];
    const key = positional[2];
    const value = positional[3];

    if (subCommand === 'get') {
      const targetKey = key || 'tmdb_api_key';
      if (
        targetKey === 'tmdb_api_key' ||
        targetKey === 'tmdb.api_key' ||
        targetKey === 'tmdb_token'
      ) {
        const info = await systemService.getTmdbApiKeyMasked();
        if (isJson) {
          streams.stdout.write(
            `${serializeJson({
              schemaVersion: 1,
              key: 'tmdb_api_key',
              value: info.maskedKey,
              masked: true,
              configured: info.configured,
            })}\n`,
          );
        } else {
          if (info.configured) {
            streams.stdout.write(`tmdb_api_key: ${info.maskedKey} (configured in SQLite)\n`);
          } else {
            streams.stdout.write('tmdb_api_key: (not configured)\n');
          }
        }
        return 0;
      }

      if (isJson) {
        streams.stdout.write(
          `${serializeJson({ schemaVersion: 1, error: `Unknown config key "${targetKey}"` })}\n`,
        );
      } else {
        streams.stderr.write(`Unknown config key: ${targetKey}\n`);
      }
      return 1;
    }

    if (subCommand === 'set') {
      if (!key) {
        if (isJson) {
          streams.stdout.write(
            `${serializeJson({ schemaVersion: 1, error: 'Missing required <key> argument for config set.' })}\n`,
          );
        } else {
          streams.stderr.write('Error: Missing required <key> argument for config set.\n');
        }
        return 1;
      }
      if (value === undefined) {
        if (isJson) {
          streams.stdout.write(
            `${serializeJson({ schemaVersion: 1, error: 'Missing required <value> argument for config set.' })}\n`,
          );
        } else {
          streams.stderr.write('Error: Missing required <value> argument for config set.\n');
        }
        return 1;
      }

      if (key === 'tmdb_api_key' || key === 'tmdb.api_key' || key === 'tmdb_token') {
        await systemService.setTmdbApiKey(value);
        const info = await systemService.getTmdbApiKeyMasked();
        if (isJson) {
          streams.stdout.write(
            `${serializeJson({
              schemaVersion: 1,
              key: 'tmdb_api_key',
              value: info.maskedKey,
              masked: true,
              configured: info.configured,
              message: 'TMDb API key saved successfully.',
            })}\n`,
          );
        } else {
          streams.stdout.write('✓ TMDb API key saved successfully.\n');
        }
        return 0;
      }

      if (isJson) {
        streams.stdout.write(
          `${serializeJson({ schemaVersion: 1, error: `Unknown config key "${key}"` })}\n`,
        );
      } else {
        streams.stderr.write(`Unknown config key: ${key}\n`);
      }
      return 1;
    }

    streams.stderr.write(
      'Usage: medialoom config get [key] | medialoom config set <key> <value>\n',
    );
    return 1;
  }

  streams.stderr.write(`Unknown command: ${command}. Use --help to view available commands.\n`);
  return 1;
}
