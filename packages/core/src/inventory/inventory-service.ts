import fs from 'node:fs/promises';
import path from 'node:path';
import { type ScanResult, scanResultSchema } from '@medialoom/contracts';
import {
  defaultInventoryRepository,
  type InventoryRepository,
  type ListMoviesOptions,
  type MovieWithHierarchy,
} from '@medialoom/db';
import {
  defaultFfprobeAdapter,
  discoverMediaFiles,
  type NormalizedTechnicalMetadata,
} from '@medialoom/media';

export interface MediaInspector {
  inspect(filePath: string): Promise<NormalizedTechnicalMetadata>;
}

export class InventoryService {
  private repo: InventoryRepository;
  private inspector: MediaInspector | null;

  constructor(repo?: InventoryRepository, inspector?: MediaInspector | null) {
    this.repo = repo ?? defaultInventoryRepository;
    this.inspector = inspector === undefined ? defaultFfprobeAdapter : inspector;
  }

  /**
   * Performs read-only discovery of media files under rootPath,
   * parses filename metadata, idempotently reconciles items/assets in the database,
   * inspects technical properties via ffprobe, and tracks file presence state.
   */
  async scan(rootPath: string): Promise<ScanResult> {
    const resolvedPath = path.resolve(rootPath);
    let canonicalRoot: string;
    try {
      canonicalRoot = await fs.realpath(resolvedPath);
    } catch {
      canonicalRoot = resolvedPath;
    }

    const scan = await this.repo.createScan({
      rootPath: canonicalRoot,
      status: 'RUNNING',
    });

    let discoveredCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    const discoveredCanonicalPaths = new Set<string>();

    try {
      const discoveredFiles = await discoverMediaFiles(canonicalRoot);
      discoveredCount = discoveredFiles.length;

      for (const file of discoveredFiles) {
        discoveredCanonicalPaths.add(file.path);

        try {
          const existingAsset = await this.repo.getAssetByPath(file.path);
          let assetId: string;
          let shouldInspectTechnical = false;

          if (existingAsset) {
            assetId = existingAsset.id;
            // Pragmatic file identity based on canonical path, size, and mtime
            const sizeMatches = Number(existingAsset.sizeBytes) === Number(file.sizeBytes);
            const mtimeMatches = existingAsset.mtime.getTime() === file.mtime.getTime();
            const wasPresent = existingAsset.present;
            const hasTechnicalMetadata = existingAsset.technicalMetadata !== null;

            if (!sizeMatches || !mtimeMatches || !wasPresent) {
              await this.repo.updateAsset(existingAsset.id, {
                sizeBytes: file.sizeBytes,
                mtime: file.mtime,
                present: true,
              });

              await this.repo.setFilenameMetadata({
                assetId: existingAsset.id,
                ...file.parsed,
              });

              updatedCount++;
              shouldInspectTechnical = true;
            } else if (!hasTechnicalMetadata) {
              // File is unchanged on disk, but missing technical inspection metadata
              shouldInspectTechnical = true;
            } else {
              // Performance optimization: file is unchanged and already inspected.
              shouldInspectTechnical = false;
            }
          } else {
            // Unmatched Movie creation
            const fallbackTitle = path.basename(file.path, file.extension);
            const title = file.parsed.title || fallbackTitle;

            const movie = await this.repo.createMovie({
              title,
              year: file.parsed.year ?? null,
              status: 'UNMATCHED',
            });

            // Edition creation
            const edition = await this.repo.createEdition({
              movieId: movie.id,
              name: file.parsed.edition ?? null,
            });

            // MediaVersion creation
            const versionNameParts = [file.parsed.screenSize, file.parsed.source].filter(Boolean);
            const versionName = versionNameParts.length > 0 ? versionNameParts.join(' ') : null;
            const mediaVersion = await this.repo.createMediaVersion({
              editionId: edition.id,
              name: versionName,
            });

            // Asset creation
            const asset = await this.repo.createAsset({
              mediaVersionId: mediaVersion.id,
              type: 'VIDEO',
              path: file.path,
              sizeBytes: file.sizeBytes,
              mtime: file.mtime,
              present: true,
            });

            // Normalized Filename Metadata attachment
            await this.repo.setFilenameMetadata({
              assetId: asset.id,
              ...file.parsed,
            });

            assetId = asset.id;
            createdCount++;
            shouldInspectTechnical = true;
          }

          if (shouldInspectTechnical && this.inspector) {
            try {
              const technical = await this.inspector.inspect(file.path);
              await this.repo.setTechnicalMetadata({
                assetId,
                container: technical.container,
                formatName: technical.formatName,
                durationSeconds: technical.durationSeconds,
                bitRate: technical.bitRate,
                width: technical.width,
                height: technical.height,
                videoCodec: technical.videoCodec,
                frameRate: technical.frameRate,
                bitDepth: technical.bitDepth,
                hdrFormat: technical.hdrFormat,
                audioCodec: technical.audioCodec,
                audioChannels: technical.audioChannels,
                audioLanguage: technical.audioLanguage,
                audioLayout: technical.audioLayout,
                rawJson: technical.rawJson,
                streams: technical.allStreams.map((s) => ({
                  index: s.index,
                  streamType: s.streamType,
                  codec: s.codec,
                  codecLongName: s.codecLongName,
                  profile: s.profile,
                  width: s.width,
                  height: s.height,
                  frameRate: s.frameRate,
                  bitDepth: s.bitDepth,
                  hdrFormat: s.hdrFormat,
                  channels: s.channels,
                  channelLayout: s.channelLayout,
                  sampleRate: s.sampleRate,
                  bitRate: s.bitRate,
                  language: s.language,
                  title: s.title,
                  isDefault: s.isDefault ?? false,
                  isForced: s.isForced ?? false,
                })),
              });
            } catch {
              // One failed technical inspection must not abort the whole scan.
              // We track the asset but mark it as failed in scan metrics.
              failedCount++;
            }
          }
        } catch {
          failedCount++;
        }
      }

      // Reconcile missing previously known files:
      // Do not permanently delete records merely because an asset is missing during one scan.
      // Mark present = false.
      const knownAssetsInRoot = await this.repo.findAssetsByPathPrefix(canonicalRoot);
      for (const knownAsset of knownAssetsInRoot) {
        if (!discoveredCanonicalPaths.has(knownAsset.path)) {
          if (knownAsset.present) {
            await this.repo.updateAsset(knownAsset.id, {
              present: false,
            });
            updatedCount++;
          }
        }
      }

      await this.repo.completeScan(scan.id, {
        discoveredCount,
        createdCount,
        updatedCount,
        failedCount,
      });

      return scanResultSchema.parse({
        schemaVersion: 1,
        scanId: scan.id,
        discovered: discoveredCount,
        created: createdCount,
        updated: updatedCount,
        failed: failedCount,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.repo.failScan(scan.id, {
        errorMessage,
        discoveredCount,
        createdCount,
        updatedCount,
        failedCount: failedCount + 1,
      });
      throw error;
    }
  }

  async listItems(options: ListMoviesOptions = {}): Promise<MovieWithHierarchy[]> {
    return this.repo.listMovies(options);
  }

  async getItem(id: string): Promise<MovieWithHierarchy | null> {
    return this.repo.getMovie(id);
  }
}

export const defaultInventoryService = new InventoryService();
