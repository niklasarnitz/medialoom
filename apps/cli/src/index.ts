import { ErrorCode, ExitCode, type ItemMatchResult } from '@medialoom/contracts';
import {
  defaultInventoryService,
  defaultLayoutService,
  defaultMatchingService,
  defaultMetadataService,
  defaultMovieMatcher,
  defaultPlanExecutor,
  defaultPlanService,
  defaultReviewService,
  defaultSystemService,
  extractLocalMovieMetadata,
  type InventoryService,
  type LayoutService,
  type MatchingService,
  type MetadataService,
  mapErrorToStructured,
  type PlanExecutor,
  type PlanService,
  type ReviewService,
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
  matchingService?: MatchingService;
  layoutService?: LayoutService;
  planService?: PlanService;
  reviewService?: ReviewService;
  planExecutor?: PlanExecutor;
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
  let providerFlag = 'tmdb';
  let idFlag: string | undefined;
  let profileFlag = 'jellyfin';
  let destinationFlag: string | undefined;
  let nameFlag: string | undefined;
  let customFlag = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === '--provider') {
      providerFlag = args[++i] ?? 'tmdb';
    } else if (arg.startsWith('--provider=')) {
      providerFlag = arg.slice('--provider='.length);
    } else if (arg === '--id') {
      idFlag = args[++i];
    } else if (arg.startsWith('--id=')) {
      idFlag = arg.slice('--id='.length);
    } else if (arg === '--profile') {
      profileFlag = args[++i] ?? 'jellyfin';
    } else if (arg.startsWith('--profile=')) {
      profileFlag = arg.slice('--profile='.length);
    } else if (arg === '--destination' || arg === '-d') {
      destinationFlag = args[++i];
    } else if (arg.startsWith('--destination=')) {
      destinationFlag = arg.slice('--destination='.length);
    } else if (arg === '--name' || arg === '--edition') {
      nameFlag = args[++i];
    } else if (arg.startsWith('--name=')) {
      nameFlag = arg.slice('--name='.length);
    } else if (arg.startsWith('--edition=')) {
      nameFlag = arg.slice('--edition='.length);
    } else if (arg === '--custom') {
      customFlag = true;
    } else if (arg.startsWith('-')) {
      flags.add(arg);
    } else {
      positional.push(arg);
    }
  }

  const isJson = flags.has('--json');
  const isHelp = flags.has('--help') || flags.has('-h') || positional[0] === 'help';
  const isVersion = flags.has('--version') || flags.has('-v') || positional[0] === 'version';
  const command = positional[0] || (isVersion ? 'version' : '');

  let systemService: SystemService;
  let inventoryService: InventoryService;
  let metadataService: MetadataService;
  let matchingService: MatchingService;
  let layoutService: LayoutService;
  let planService: PlanService;
  let reviewService: ReviewService;
  let planExecutor: PlanExecutor;

  if ('getVersion' in systemOrServices) {
    systemService = systemOrServices;
    inventoryService = inventoryServiceArg ?? defaultInventoryService;
    metadataService = defaultMetadataService;
    matchingService = defaultMatchingService;
    layoutService = defaultLayoutService;
    planService = defaultPlanService;
    reviewService = defaultReviewService;
    planExecutor = defaultPlanExecutor;
  } else {
    systemService = systemOrServices.systemService ?? defaultSystemService;
    inventoryService = systemOrServices.inventoryService ?? defaultInventoryService;
    metadataService = systemOrServices.metadataService ?? defaultMetadataService;
    matchingService = systemOrServices.matchingService ?? defaultMatchingService;
    layoutService = systemOrServices.layoutService ?? defaultLayoutService;
    planService = systemOrServices.planService ?? defaultPlanService;
    reviewService = systemOrServices.reviewService ?? defaultReviewService;
    planExecutor = systemOrServices.planExecutor ?? defaultPlanExecutor;
  }

  function emitSuccess(commandName: string, data: unknown): void {
    if (isJson) {
      streams.stdout.write(
        `${serializeJson({
          schemaVersion: 1,
          command: commandName,
          status: 'success',
          data,
        })}\n`,
      );
    }
  }

  function emitError(
    commandName: string,
    errorObj: { code: string; message: string; details?: Record<string, unknown> },
    humanMessage?: string,
  ): void {
    if (isJson) {
      streams.stdout.write(
        `${serializeJson({
          schemaVersion: 1,
          command: commandName,
          status: 'error',
          error: errorObj,
        })}\n`,
      );
    } else {
      streams.stderr.write(`${humanMessage ?? errorObj.message}\n`);
    }
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
        '  match <id>          Match item to provider (supports --provider <p> --id <id>)',
        '  layout <id>         Calculate output layout plan (supports --profile <p> --destination <d>)',
        '  plan <id>           Generate, validate, and persist OperationPlan',
        '  plans               List persisted OperationPlans',
        '  plan-show <id>      Inspect details of a persisted OperationPlan',
        '  review list         List proposed filesystem changes in the review queue',
        '  review show <id>    Inspect detailed proposal for a review queue item',
        '  review approve <id> Explicitly approve a proposed filesystem change',
        '  review reject <id>  Reject a proposed filesystem change without modifying files',
        '  review apply <id>   Execute an approved filesystem change plan',
        '  edition-set <id>    Assign or override edition for a media version (--name <name>)',
        '  edition-reviews     List all editions requiring user review',
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
        '  --provider <p>      Metadata provider for matching (default: tmdb)',
        '  --id <id>           Provider movie ID for manual match override',
        '  --profile <p>       Output server profile (default: jellyfin)',
        '  --destination, -d   Destination root directory for layout calculation',
        '',
        'Exit Codes:',
        '  0                   Success',
        '  1                   Generic failure',
        '  2                   Invalid input or configuration',
        '  3                   Review required / unmatched',
        '  4                   Provider or network failure',
        '  5                   Resource or filesystem conflict',
        '',
      ].join('\n'),
    );
    return ExitCode.SUCCESS;
  }

  if (command === 'version' || isVersion) {
    const version = systemService.getVersion();
    if (isJson) {
      emitSuccess('version', { version });
    } else {
      streams.stdout.write(`medialoom ${version}\n`);
    }
    return ExitCode.SUCCESS;
  }

  if (command === 'doctor') {
    try {
      const report = await systemService.getDoctorReport();
      if (isJson) {
        emitSuccess('doctor', report);
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
      return report.status === 'error' ? ExitCode.GENERIC_FAILURE : ExitCode.SUCCESS;
    } catch (err) {
      const mapped = mapErrorToStructured(err);
      emitError('doctor', { code: mapped.code, message: mapped.message, details: mapped.details });
      return mapped.exitCode;
    }
  }

  if (command === 'scan') {
    const scanPath = positional[1];
    if (!scanPath) {
      emitError(
        'scan',
        {
          code: ErrorCode.INVALID_ARGUMENT,
          message: 'Missing required <path> argument for scan command.',
        },
        'Error: Missing required <path> argument for scan command.',
      );
      return ExitCode.INVALID_INPUT;
    }

    try {
      const result = await inventoryService.scan(scanPath);
      if (isJson) {
        emitSuccess('scan', {
          scanId: result.scanId,
          discovered: result.discovered,
          created: result.created,
          updated: result.updated,
          failed: result.failed,
        });
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
      return result.failed > 0 ? ExitCode.GENERIC_FAILURE : ExitCode.SUCCESS;
    } catch (err) {
      const mapped = mapErrorToStructured(err);
      emitError(
        'scan',
        { code: mapped.code, message: mapped.message, details: mapped.details },
        `Scan error: ${mapped.message}`,
      );
      return mapped.exitCode;
    }
  }

  if (command === 'items') {
    try {
      const items = await inventoryService.listItems();
      if (isJson) {
        emitSuccess('items', { items });
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
      return ExitCode.SUCCESS;
    } catch (err) {
      const mapped = mapErrorToStructured(err);
      emitError(
        'items',
        { code: mapped.code, message: mapped.message, details: mapped.details },
        `Failed to list items: ${mapped.message}`,
      );
      return mapped.exitCode;
    }
  }

  if (command === 'inspect') {
    const itemId = positional[1];
    if (!itemId) {
      emitError(
        'inspect',
        {
          code: ErrorCode.INVALID_ARGUMENT,
          message: 'Missing required <id> argument for inspect command.',
        },
        'Error: Missing required <id> argument for inspect command.',
      );
      return ExitCode.INVALID_INPUT;
    }

    try {
      const item = await inventoryService.getItem(itemId);
      if (!item) {
        emitError(
          'inspect',
          {
            code: ErrorCode.ITEM_NOT_FOUND,
            message: `MediaItem "${itemId}" not found in inventory.`,
          },
          `Item not found: ${itemId}`,
        );
        return ExitCode.GENERIC_FAILURE;
      }

      if (isJson) {
        emitSuccess('inspect', { item });
      } else {
        const lines: string[] = [
          `MediaItem: ${item.title} ${item.year ? `(${item.year})` : ''}`,
          `  ID:     ${item.id}`,
          `  Status: ${item.status}`,
        ];
        if (item.matchConfidence !== null && item.matchConfidence !== undefined) {
          lines.push(
            `  Match Confidence: ${(item.matchConfidence * 100).toFixed(1)}% (${item.matchConfidence.toFixed(2)})`,
          );
        }
        if (item.matchDetails) {
          try {
            const parsed = JSON.parse(item.matchDetails);
            if (parsed.components) {
              const c = parsed.components;
              lines.push(
                `  Score Breakdown:  title=${c.title?.toFixed(2) ?? '-'}, year=${c.year?.toFixed(2) ?? '-'}, runtime=${c.runtime?.toFixed(2) ?? '-'}, rank=${c.providerRank?.toFixed(2) ?? '-'}, penalty=${c.penalty?.toFixed(2) ?? '-'}`,
              );
            }
          } catch {
            // ignore non-json
          }
        }
        if (item.tmdbId) lines.push(`  TMDb ID: ${item.tmdbId}`);
        if (item.imdbId) lines.push(`  IMDb ID: ${item.imdbId}`);

        lines.push('', '  Editions:');
        for (const edition of item.editions) {
          const reviewTag = edition.needsReview ? ' [NEEDS REVIEW]' : '';
          const normStr =
            edition.normalizedName && edition.normalizedName !== edition.name
              ? ` (Normalized: "${edition.normalizedName}")`
              : '';
          const typeStr = edition.type && edition.type !== 'DEFAULT' ? ` [${edition.type}]` : '';
          const runtimeStr = edition.runtimeMinutes ? ` [${edition.runtimeMinutes} min]` : '';
          const displayName = edition.normalizedName || edition.name || 'Standard';

          lines.push(
            `    - Edition: ${displayName}${normStr}${typeStr}${runtimeStr}${reviewTag} (ID: ${edition.id})`,
          );
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
      return ExitCode.SUCCESS;
    } catch (err) {
      const mapped = mapErrorToStructured(err);
      emitError(
        'inspect',
        { code: mapped.code, message: mapped.message, details: mapped.details },
        `Failed to inspect item: ${mapped.message}`,
      );
      return mapped.exitCode;
    }
  }

  if (command === 'candidates') {
    const itemId = positional[1];
    if (!itemId) {
      emitError(
        'candidates',
        {
          code: ErrorCode.INVALID_ARGUMENT,
          message: 'Missing required <id> argument for candidates command.',
        },
        'Error: Missing required <id> argument for candidates command.',
      );
      return ExitCode.INVALID_INPUT;
    }

    try {
      const result = await metadataService.getCandidatesForItem(itemId);
      const localMetadata = extractLocalMovieMetadata(result.item);
      const evaluation = defaultMovieMatcher.evaluateCandidates(localMetadata, result.candidates);

      if (isJson) {
        emitSuccess('candidates', {
          itemId: result.item.id,
          query: result.query,
          year: result.year,
          decision: evaluation.decision,
          candidates: result.candidates,
          evaluations: evaluation.evaluations,
        });
      } else {
        const lines: string[] = [
          `MediaItem: ${result.item.title}${result.year ? ` (${result.year})` : ''} [ID: ${result.item.id}]`,
          `Query: "${result.query}"${result.year ? ` (Year: ${result.year})` : ''}`,
          `Decision: ${evaluation.decision}`,
          '',
        ];
        if (result.candidates.length === 0) {
          lines.push(`No candidates found for "${result.query}".`);
        } else {
          lines.push(`Candidates (${result.candidates.length} found):`);
          lines.push('');
          for (const [i, evalItem] of evaluation.evaluations.entries()) {
            const c = evalItem.candidate;
            const yearStr = c.year ? ` (${c.year})` : '';
            const scorePercent = (evalItem.score * 100).toFixed(0);
            const comp = evalItem.components;
            const breakdown = `[title=${comp.title.toFixed(2)}, year=${comp.year.toFixed(2)}, runtime=${comp.runtime.toFixed(2)}, rank=${comp.providerRank.toFixed(2)}, penalty=${comp.penalty.toFixed(2)}]`;
            lines.push(
              `  [${i + 1}] [${c.provider.toUpperCase()} ${c.providerId}] ${c.title}${yearStr}`,
            );
            lines.push(`      Score: ${evalItem.score.toFixed(2)} (${scorePercent}%) ${breakdown}`);
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
      return ExitCode.SUCCESS;
    } catch (err) {
      const mapped = mapErrorToStructured(err);
      emitError(
        'candidates',
        { code: mapped.code, message: mapped.message, details: mapped.details },
        `Candidates error: ${mapped.message}`,
      );
      return mapped.exitCode;
    }
  }

  if (command === 'match') {
    const itemId = positional[1];
    if (!itemId) {
      emitError(
        'match',
        {
          code: ErrorCode.INVALID_ARGUMENT,
          message: 'Missing required <id> argument for match command.',
        },
        'Error: Missing required <id> argument for match command.',
      );
      return ExitCode.INVALID_INPUT;
    }

    try {
      let result: ItemMatchResult;
      if (idFlag !== undefined) {
        result = await matchingService.manualMatch(itemId, {
          provider: providerFlag,
          id: idFlag,
        });
      } else {
        result = await matchingService.matchItem(itemId);
      }

      if (isJson) {
        emitSuccess('match', {
          itemId: result.itemId,
          decision: result.decision,
          score: result.score,
          components: result.components,
          matched: result.decision === 'AUTO_MATCH',
          isManual: result.isManual,
          candidate: result.selectedCandidate,
          evaluations: result.evaluations,
        });
      } else {
        const lines: string[] = [
          'MediaLoom Match Decision',
          `  Item ID:   ${result.itemId}`,
          `  Decision:  ${result.decision}`,
        ];
        if (result.score !== null && result.score !== undefined) {
          lines.push(
            `  Score:     ${result.score.toFixed(2)} (${(result.score * 100).toFixed(0)}%)`,
          );
        }
        if (result.components) {
          const comp = result.components;
          lines.push(
            `  Breakdown: title=${comp.title.toFixed(2)}, year=${comp.year.toFixed(2)}, runtime=${comp.runtime.toFixed(2)}, providerRank=${comp.providerRank.toFixed(2)}, penalty=${comp.penalty.toFixed(2)}`,
          );
        }
        if (result.selectedCandidate) {
          const c = result.selectedCandidate;
          lines.push(
            `  Matched:   [${c.provider.toUpperCase()} ${c.providerId}] ${c.title}${c.year ? ` (${c.year})` : ''}`,
          );
          if (c.runtimeMinutes) {
            lines.push(`  Runtime:   ${c.runtimeMinutes} min`);
          }
          if (c.imdbId) {
            lines.push(`  IMDb ID:   ${c.imdbId}`);
          }
        }
        if (result.isManual) {
          lines.push('  Mode:      Manual match override');
        }
        lines.push('');
        streams.stdout.write(lines.join('\n'));
      }

      if (result.decision === 'REVIEW_REQUIRED' || result.decision === 'UNMATCHED') {
        return ExitCode.REVIEW_REQUIRED;
      }
      return ExitCode.SUCCESS;
    } catch (err) {
      const mapped = mapErrorToStructured(err);
      emitError(
        'match',
        { code: mapped.code, message: mapped.message, details: mapped.details },
        `Match error: ${mapped.message}`,
      );
      return mapped.exitCode;
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
        try {
          const info = await systemService.getTmdbApiKeyMasked();
          if (isJson) {
            emitSuccess('config', {
              schemaVersion: 1,
              key: 'tmdb_api_key',
              value: info.maskedKey,
              masked: true,
              configured: info.configured,
            });
          } else {
            if (info.configured) {
              streams.stdout.write(`tmdb_api_key: ${info.maskedKey} (configured in SQLite)\n`);
            } else {
              streams.stdout.write('tmdb_api_key: (not configured)\n');
            }
          }
          return ExitCode.SUCCESS;
        } catch (err) {
          const mapped = mapErrorToStructured(err);
          emitError('config', { code: mapped.code, message: mapped.message });
          return mapped.exitCode;
        }
      }

      emitError(
        'config',
        {
          code: ErrorCode.INVALID_CONFIG,
          message: `Unknown config key "${targetKey}"`,
        },
        `Unknown config key: ${targetKey}`,
      );
      return ExitCode.INVALID_INPUT;
    }

    if (subCommand === 'set') {
      if (!key) {
        emitError(
          'config',
          {
            code: ErrorCode.INVALID_ARGUMENT,
            message: 'Missing required <key> argument for config set.',
          },
          'Error: Missing required <key> argument for config set.',
        );
        return ExitCode.INVALID_INPUT;
      }
      if (value === undefined) {
        emitError(
          'config',
          {
            code: ErrorCode.INVALID_ARGUMENT,
            message: 'Missing required <value> argument for config set.',
          },
          'Error: Missing required <value> argument for config set.',
        );
        return ExitCode.INVALID_INPUT;
      }

      if (key === 'tmdb_api_key' || key === 'tmdb.api_key' || key === 'tmdb_token') {
        try {
          await systemService.setTmdbApiKey(value);
          const info = await systemService.getTmdbApiKeyMasked();
          if (isJson) {
            emitSuccess('config', {
              schemaVersion: 1,
              key: 'tmdb_api_key',
              value: info.maskedKey,
              masked: true,
              configured: info.configured,
              message: 'TMDb API key saved successfully.',
            });
          } else {
            streams.stdout.write('✓ TMDb API key saved successfully.\n');
          }
          return ExitCode.SUCCESS;
        } catch (err) {
          const mapped = mapErrorToStructured(err);
          emitError('config', { code: mapped.code, message: mapped.message });
          return mapped.exitCode;
        }
      }

      emitError(
        'config',
        {
          code: ErrorCode.INVALID_CONFIG,
          message: `Unknown config key "${key}"`,
        },
        `Unknown config key: ${key}`,
      );
      return ExitCode.INVALID_INPUT;
    }

    emitError(
      'config',
      {
        code: ErrorCode.INVALID_ARGUMENT,
        message: 'Usage: medialoom config get [key] | medialoom config set <key> <value>',
      },
      'Usage: medialoom config get [key] | medialoom config set <key> <value>',
    );
    return ExitCode.INVALID_INPUT;
  }

  if (command === 'layout') {
    const itemId = positional[1];
    if (!itemId) {
      emitError(
        'layout',
        {
          code: ErrorCode.INVALID_ARGUMENT,
          message: 'Missing required <id> argument for layout command.',
        },
        'Error: Missing required <id> argument for layout command.',
      );
      return ExitCode.INVALID_INPUT;
    }

    if (!destinationFlag) {
      emitError(
        'layout',
        {
          code: ErrorCode.INVALID_ARGUMENT,
          message: 'Missing required --destination <path> argument for layout command.',
        },
        'Error: Missing required --destination <path> argument for layout command.',
      );
      return ExitCode.INVALID_INPUT;
    }

    try {
      const plan = await layoutService.generateMovieLayout(itemId, {
        profile: profileFlag,
        destinationRoot: destinationFlag,
      });

      if (isJson) {
        emitSuccess('layout', {
          itemId,
          profile: plan.profile,
          plan,
        });
      } else {
        const lines: string[] = [
          `MediaLoom Layout Plan (Profile: ${plan.profile})`,
          `  Item ID:       ${itemId}`,
          `  Destination:   ${plan.destinationDirectory}`,
        ];

        if (plan.mediaFiles && plan.mediaFiles.length > 1) {
          lines.push(`  Media Files (${plan.mediaFiles.length} versions):`);
          for (const mf of plan.mediaFiles) {
            const labelStr = mf.versionLabel ? ` [${mf.versionLabel}]` : '';
            lines.push(`    - ${mf.mediaFilename}${labelStr}`);
            lines.push(`      Target: ${mf.destinationMediaPath}`);
          }
        } else {
          lines.push(`  Media File:    ${plan.mediaFilename}`);
          lines.push(`  Media Target:  ${plan.destinationMediaPath}`);
        }

        lines.push('  Sidecars:');
        for (const sidecar of plan.sidecars) {
          lines.push(
            `    - ${sidecar.filename} (${sidecar.type}, ${sidecar.content.length} bytes)`,
          );
          lines.push(`      Target: ${sidecar.destinationPath}`);
        }
        lines.push('');
        streams.stdout.write(lines.join('\n'));
      }
      return ExitCode.SUCCESS;
    } catch (err) {
      const mapped = mapErrorToStructured(err);
      emitError(
        'layout',
        { code: mapped.code, message: mapped.message, details: mapped.details },
        `Layout error: ${mapped.message}`,
      );
      return mapped.exitCode;
    }
  }

  if (command === 'plan') {
    const itemId = positional[1];
    if (!itemId) {
      emitError(
        'plan',
        {
          code: ErrorCode.INVALID_ARGUMENT,
          message: 'Missing required <id> argument for plan command.',
        },
        'Error: Missing required <id> argument for plan command.',
      );
      return ExitCode.INVALID_INPUT;
    }

    if (!destinationFlag) {
      emitError(
        'plan',
        {
          code: ErrorCode.INVALID_ARGUMENT,
          message: 'Missing required --destination <path> argument for plan command.',
        },
        'Error: Missing required --destination <path> argument for plan command.',
      );
      return ExitCode.INVALID_INPUT;
    }

    try {
      const plan = await planService.createPlan({
        itemId,
        profile: profileFlag,
        destination: destinationFlag,
        validate: true,
      });

      if (isJson) {
        emitSuccess('plan', {
          plan,
        });
      } else {
        const lines: string[] = [
          'MediaLoom Operation Plan',
          `  Plan ID:      ${plan.id}`,
          `  Item ID:      ${plan.mediaItemId}`,
          `  Profile:      ${plan.profile}`,
          `  Destination:  ${plan.destinationRoot}`,
          `  Status:       ${plan.status}`,
          `  Created:      ${new Date(plan.createdAt).toISOString()}`,
        ];
        if (plan.failureReason) {
          lines.push(`  Failure:      ${plan.failureReason}`);
        }
        lines.push('', `  Operations (${plan.operations.length}):`);
        for (const [idx, op] of plan.operations.entries()) {
          const num = `[${idx + 1}]`.padEnd(5);
          if (op.type === 'mkdir') {
            lines.push(`    ${num} mkdir     ${op.path}`);
          } else if (op.type === 'move') {
            lines.push(`    ${num} move      ${op.source} -> ${op.destination}`);
          } else if (op.type === 'writeText') {
            lines.push(`    ${num} writeText ${op.path} (${op.content.length} chars)`);
          }
        }
        if (plan.validation) {
          lines.push(
            '',
            `  Validation:   ${plan.validation.valid ? 'VALID' : 'INVALID'} (${plan.validation.issues.length} issues)`,
          );
          for (const issue of plan.validation.issues) {
            const sev = issue.severity.toUpperCase();
            lines.push(`    - [${sev}] ${issue.code}: ${issue.message}`);
          }
        }
        lines.push('');
        streams.stdout.write(lines.join('\n'));
      }
      return plan.status === 'FAILED' ? ExitCode.CONFLICT : ExitCode.SUCCESS;
    } catch (err) {
      const mapped = mapErrorToStructured(err);
      emitError(
        'plan',
        { code: mapped.code, message: mapped.message, details: mapped.details },
        `Plan error: ${mapped.message}`,
      );
      return mapped.exitCode;
    }
  }

  if (command === 'plans') {
    try {
      const plans = await planService.listPlans();

      if (isJson) {
        emitSuccess('plans', {
          plans,
        });
      } else {
        if (plans.length === 0) {
          streams.stdout.write('No operation plans found.\n');
        } else {
          const lines: string[] = [
            `Operation Plans (${plans.length} total):`,
            '',
            `${'ID'.padEnd(28)} ${'STATUS'.padEnd(12)} ${'PROFILE'.padEnd(12)} ${'ITEM ID'.padEnd(28)} DESTINATION`,
            '-'.repeat(105),
          ];
          for (const p of plans) {
            lines.push(
              `${p.id.padEnd(28)} ${p.status.padEnd(12)} ${p.profile.padEnd(12)} ${p.mediaItemId.padEnd(28)} ${p.destinationRoot}`,
            );
          }
          lines.push('');
          streams.stdout.write(lines.join('\n'));
        }
      }
      return ExitCode.SUCCESS;
    } catch (err) {
      const mapped = mapErrorToStructured(err);
      emitError(
        'plans',
        { code: mapped.code, message: mapped.message, details: mapped.details },
        `Plans error: ${mapped.message}`,
      );
      return mapped.exitCode;
    }
  }

  if (command === 'plan-show') {
    const planId = positional[1];
    if (!planId) {
      emitError(
        'plan-show',
        {
          code: ErrorCode.INVALID_ARGUMENT,
          message: 'Missing required <id> argument for plan-show command.',
        },
        'Error: Missing required <id> argument for plan-show command.',
      );
      return ExitCode.INVALID_INPUT;
    }

    try {
      const plan = await planService.getPlan(planId);
      if (!plan) {
        emitError(
          'plan-show',
          {
            code: ErrorCode.ITEM_NOT_FOUND,
            message: `OperationPlan "${planId}" not found.`,
          },
          `Plan not found: ${planId}`,
        );
        return ExitCode.GENERIC_FAILURE;
      }

      if (isJson) {
        emitSuccess('plan-show', {
          plan,
        });
      } else {
        const lines: string[] = [
          'MediaLoom Operation Plan',
          `  Plan ID:      ${plan.id}`,
          `  Item ID:      ${plan.mediaItemId}`,
          `  Profile:      ${plan.profile}`,
          `  Destination:  ${plan.destinationRoot}`,
          `  Status:       ${plan.status}`,
          `  Created:      ${new Date(plan.createdAt).toISOString()}`,
        ];
        if (plan.validatedAt) {
          lines.push(`  Validated:    ${new Date(plan.validatedAt).toISOString()}`);
        }
        if (plan.appliedAt) {
          lines.push(`  Applied:      ${new Date(plan.appliedAt).toISOString()}`);
        }
        if (plan.failureReason) {
          lines.push(`  Failure:      ${plan.failureReason}`);
        }
        lines.push('', `  Operations (${plan.operations.length}):`);
        for (const [idx, op] of plan.operations.entries()) {
          const num = `[${idx + 1}]`.padEnd(5);
          if (op.type === 'mkdir') {
            lines.push(`    ${num} mkdir     ${op.path}`);
          } else if (op.type === 'move') {
            lines.push(`    ${num} move      ${op.source} -> ${op.destination}`);
          } else if (op.type === 'writeText') {
            lines.push(`    ${num} writeText ${op.path} (${op.content.length} chars)`);
          }
        }
        if (plan.validation) {
          lines.push(
            '',
            `  Validation:   ${plan.validation.valid ? 'VALID' : 'INVALID'} (${plan.validation.issues.length} issues)`,
          );
          for (const issue of plan.validation.issues) {
            const sev = issue.severity.toUpperCase();
            lines.push(`    - [${sev}] ${issue.code}: ${issue.message}`);
          }
        }
        lines.push('');
        streams.stdout.write(lines.join('\n'));
      }
      return ExitCode.SUCCESS;
    } catch (err) {
      const mapped = mapErrorToStructured(err);
      emitError(
        'plan-show',
        { code: mapped.code, message: mapped.message, details: mapped.details },
        `Plan-show error: ${mapped.message}`,
      );
      return mapped.exitCode;
    }
  }

  if (
    command === 'review' ||
    command === 'review-list' ||
    command === 'review-show' ||
    command === 'review-approve' ||
    command === 'review-reject' ||
    command === 'review-apply'
  ) {
    let subCommand = positional[1];
    let targetReviewId = positional[2];

    if (command === 'review-list') {
      subCommand = 'list';
      targetReviewId = positional[1];
    } else if (command === 'review-show') {
      subCommand = 'show';
      targetReviewId = positional[1];
    } else if (command === 'review-approve') {
      subCommand = 'approve';
      targetReviewId = positional[1];
    } else if (command === 'review-reject') {
      subCommand = 'reject';
      targetReviewId = positional[1];
    } else if (command === 'review-apply') {
      subCommand = 'apply';
      targetReviewId = positional[1];
    }

    if (!subCommand || subCommand === 'list') {
      try {
        const items = await reviewService.listReviewItems();

        if (isJson) {
          emitSuccess('review list', { items });
        } else {
          if (items.length === 0) {
            streams.stdout.write('No review queue items found.\n');
          } else {
            const lines: string[] = [
              `Review Queue (${items.length} total):`,
              '',
              `${'ID'.padEnd(28)} ${'STATUS'.padEnd(12)} ${'TYPE'.padEnd(20)} TITLE`,
              '-'.repeat(95),
            ];
            for (const item of items) {
              lines.push(
                `${item.id.padEnd(28)} ${item.status.padEnd(12)} ${item.type.padEnd(20)} ${item.title}`,
              );
            }
            lines.push('');
            streams.stdout.write(lines.join('\n'));
          }
        }
        return ExitCode.SUCCESS;
      } catch (err) {
        const mapped = mapErrorToStructured(err);
        emitError(
          'review list',
          { code: mapped.code, message: mapped.message, details: mapped.details },
          `Review list error: ${mapped.message}`,
        );
        return mapped.exitCode;
      }
    }

    if (subCommand === 'show') {
      if (!targetReviewId) {
        emitError(
          'review show',
          {
            code: ErrorCode.INVALID_ARGUMENT,
            message: 'Missing required <id> argument for review show command.',
          },
          'Error: Missing required <id> argument for review show command.',
        );
        return ExitCode.INVALID_INPUT;
      }

      try {
        const item = await reviewService.getReviewItem(targetReviewId);
        if (!item) {
          emitError(
            'review show',
            {
              code: ErrorCode.ITEM_NOT_FOUND,
              message: `ReviewQueueItem "${targetReviewId}" not found.`,
            },
            `Review item not found: ${targetReviewId}`,
          );
          return ExitCode.GENERIC_FAILURE;
        }

        if (isJson) {
          emitSuccess('review show', { item });
        } else {
          const lines: string[] = [
            `Review Queue Item: ${item.id}`,
            `  Title:       ${item.title}`,
            `  Type:        ${item.type}`,
            `  Status:      ${item.status}`,
            `  Plan ID:     ${item.operationPlanId}`,
            `  Created:     ${new Date(item.createdAt).toISOString()}`,
          ];
          if (item.reviewedAt) {
            lines.push(`  Reviewed:    ${new Date(item.reviewedAt).toISOString()}`);
          }
          if (item.approvedAt) {
            lines.push(`  Approved:    ${new Date(item.approvedAt).toISOString()}`);
          }
          if (item.rejectedAt) {
            lines.push(`  Rejected:    ${new Date(item.rejectedAt).toISOString()}`);
          }

          if (item.details?.affectedMovie) {
            const m = item.details.affectedMovie;
            lines.push(`  Movie:       ${m.title} ${m.year ? `(${m.year})` : ''} [ID: ${m.id}]`);
          }
          if (item.details?.destinationRoot) {
            lines.push(`  Destination: ${item.details.destinationRoot}`);
          }

          lines.push('', '  Summary:');
          const summaryIndented = item.summary
            .split('\n')
            .map((l) => `    ${l}`)
            .join('\n');
          lines.push(summaryIndented);

          if (item.details?.filesToMove && item.details.filesToMove.length > 0) {
            lines.push('', `  Files to Move (${item.details.filesToMove.length}):`);
            for (const m of item.details.filesToMove) {
              lines.push(`    - ${m.source}`);
              lines.push(`      → ${m.destination}`);
              if (m.versionLabel || m.edition) {
                const labels = [
                  m.edition ? `Edition: ${m.edition}` : null,
                  m.versionLabel ? `Version: ${m.versionLabel}` : null,
                ]
                  .filter(Boolean)
                  .join(', ');
                lines.push(`      [${labels}]`);
              }
            }
          }

          if (item.details?.filesToWrite && item.details.filesToWrite.length > 0) {
            lines.push('', `  Files to Write (${item.details.filesToWrite.length}):`);
            for (const w of item.details.filesToWrite) {
              lines.push(`    - ${w.path} (${w.filename})`);
            }
          }

          if (item.details?.validation) {
            lines.push(
              '',
              `  Validation:  ${item.details.validation.valid ? 'VALID' : 'INVALID'} (${item.details.validation.issues.length} issues)`,
            );
            for (const issue of item.details.validation.issues) {
              const sev = issue.severity.toUpperCase();
              lines.push(`    - [${sev}] ${issue.code}: ${issue.message}`);
            }
          }

          lines.push('');
          streams.stdout.write(lines.join('\n'));
        }
        return ExitCode.SUCCESS;
      } catch (err) {
        const mapped = mapErrorToStructured(err);
        emitError(
          'review show',
          { code: mapped.code, message: mapped.message, details: mapped.details },
          `Review show error: ${mapped.message}`,
        );
        return mapped.exitCode;
      }
    }

    if (subCommand === 'approve') {
      if (!targetReviewId) {
        emitError(
          'review approve',
          {
            code: ErrorCode.INVALID_ARGUMENT,
            message: 'Missing required <id> argument for review approve command.',
          },
          'Error: Missing required <id> argument for review approve command.',
        );
        return ExitCode.INVALID_INPUT;
      }

      try {
        const updated = await reviewService.approveReviewItem(targetReviewId);

        if (isJson) {
          emitSuccess('review approve', {
            item: updated,
            action: 'APPROVED',
            message: `Review item ${targetReviewId} approved successfully.`,
          });
        } else {
          streams.stdout.write(
            `✓ Review item "${targetReviewId}" approved successfully. Plan is now eligible for execution.\n`,
          );
        }
        return ExitCode.SUCCESS;
      } catch (err) {
        const mapped = mapErrorToStructured(err);
        emitError(
          'review approve',
          { code: mapped.code, message: mapped.message, details: mapped.details },
          `Review approve error: ${mapped.message}`,
        );
        return mapped.exitCode;
      }
    }

    if (subCommand === 'reject') {
      if (!targetReviewId) {
        emitError(
          'review reject',
          {
            code: ErrorCode.INVALID_ARGUMENT,
            message: 'Missing required <id> argument for review reject command.',
          },
          'Error: Missing required <id> argument for review reject command.',
        );
        return ExitCode.INVALID_INPUT;
      }

      try {
        const updated = await reviewService.rejectReviewItem(targetReviewId);

        if (isJson) {
          emitSuccess('review reject', {
            item: updated,
            action: 'REJECTED',
            message: `Review item ${targetReviewId} rejected.`,
          });
        } else {
          streams.stdout.write(
            `✓ Review item "${targetReviewId}" rejected. Media files remain untouched.\n`,
          );
        }
        return ExitCode.SUCCESS;
      } catch (err) {
        const mapped = mapErrorToStructured(err);
        emitError(
          'review reject',
          { code: mapped.code, message: mapped.message, details: mapped.details },
          `Review reject error: ${mapped.message}`,
        );
        return mapped.exitCode;
      }
    }

    if (subCommand === 'apply') {
      if (!targetReviewId) {
        emitError(
          'review apply',
          {
            code: ErrorCode.INVALID_ARGUMENT,
            message: 'Missing required <id> argument for review apply command.',
          },
          'Error: Missing required <id> argument for review apply command.',
        );
        return ExitCode.INVALID_INPUT;
      }

      try {
        const result = await planExecutor.executeReviewItem(targetReviewId);

        if (isJson) {
          emitSuccess('review apply', {
            plan: result.plan,
            reviewItem: result.reviewItem,
            executedOperations: result.executedOperations,
          });
        } else {
          streams.stdout.write(
            `✓ Review item "${targetReviewId}" applied successfully (${result.executedOperations} operations executed).\n`,
          );
        }
        return ExitCode.SUCCESS;
      } catch (err) {
        const mapped = mapErrorToStructured(err);
        emitError(
          'review apply',
          { code: mapped.code, message: mapped.message, details: mapped.details },
          `Review apply error: ${mapped.message}`,
        );
        return mapped.exitCode;
      }
    }

    emitError(
      'review',
      {
        code: ErrorCode.INVALID_ARGUMENT,
        message: `Unknown review subcommand "${subCommand}". Usage: medialoom review [list|show|approve|reject|apply]`,
      },
      `Unknown review subcommand "${subCommand}". Usage: medialoom review [list|show|approve|reject|apply]`,
    );
    return ExitCode.INVALID_INPUT;
  }

  if (command === 'edition-set') {
    const versionId = positional[1];
    if (!versionId) {
      emitError(
        'edition-set',
        {
          code: ErrorCode.INVALID_ARGUMENT,
          message: 'Missing required <versionId> argument for edition-set command.',
        },
        'Error: Missing required <versionId> argument for edition-set command.',
      );
      return ExitCode.INVALID_INPUT;
    }

    if (nameFlag === undefined && !flags.has('--name') && !flags.has('--edition')) {
      emitError(
        'edition-set',
        {
          code: ErrorCode.INVALID_ARGUMENT,
          message: 'Missing required --name <editionName> argument for edition-set command.',
        },
        'Error: Missing required --name <editionName> argument for edition-set command.',
      );
      return ExitCode.INVALID_INPUT;
    }

    try {
      const updatedMovie = await inventoryService.assignEdition({
        versionId,
        name: nameFlag ?? null,
        custom: customFlag,
      });

      if (isJson) {
        emitSuccess('edition-set', {
          item: updatedMovie,
        });
      } else {
        streams.stdout.write(
          `✓ Edition assigned successfully for version ${versionId} on movie "${updatedMovie.title}".\n`,
        );
      }
      return ExitCode.SUCCESS;
    } catch (err) {
      const mapped = mapErrorToStructured(err);
      emitError(
        'edition-set',
        { code: mapped.code, message: mapped.message, details: mapped.details },
        `Edition-set error: ${mapped.message}`,
      );
      return mapped.exitCode;
    }
  }

  if (command === 'edition-reviews') {
    try {
      const editions = await inventoryService.listEditionsNeedingReview();

      if (isJson) {
        emitSuccess('edition-reviews', {
          editions,
        });
      } else {
        if (editions.length === 0) {
          streams.stdout.write('No editions requiring review.\n');
        } else {
          const lines: string[] = [
            `Editions Requiring Review (${editions.length} total):`,
            '',
            `${'EDITION ID'.padEnd(28)} ${'MOVIE ID'.padEnd(28)} ${'RAW NAME'.padEnd(20)} NORMALIZED`,
            '-'.repeat(95),
          ];
          for (const e of editions) {
            lines.push(
              `${e.id.padEnd(28)} ${e.movieId.padEnd(28)} ${(e.name ?? '-').padEnd(20)} ${e.normalizedName ?? '-'}`,
            );
          }
          lines.push('');
          streams.stdout.write(lines.join('\n'));
        }
      }
      return ExitCode.SUCCESS;
    } catch (err) {
      const mapped = mapErrorToStructured(err);
      emitError(
        'edition-reviews',
        { code: mapped.code, message: mapped.message, details: mapped.details },
        `Edition-reviews error: ${mapped.message}`,
      );
      return mapped.exitCode;
    }
  }

  emitError(
    'unknown',
    {
      code: ErrorCode.INVALID_ARGUMENT,
      message: `Unknown command: ${command}. Use --help to view available commands.`,
    },
    `Unknown command: ${command}. Use --help to view available commands.`,
  );
  return ExitCode.INVALID_INPUT;
}
