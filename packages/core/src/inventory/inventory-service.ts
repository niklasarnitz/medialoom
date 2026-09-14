import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type MovieWithEditions,
  type ScanResult,
  scanResultSchema,
} from '@medialoom/contracts';
import {
  type InventoryRepository,
  type ListMoviesOptions,
  defaultInventoryRepository,
} from '@medialoom/db';
import { discoverMediaFiles } from '@medialoom/media';

export class InventoryService {
  private repo: InventoryRepository;

  constructor(repo?: InventoryRepository) {
    this.repo = repo ?? defaultInventoryRepository;
  }

  /**
   * Performs read-only discovery of media files under rootPath,
   * parses filename metadata, idempotently reconciles items/assets in the database,
   * and tracks file presence state.
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

          if (existingAsset) {
            // Pragmatic file identity based on canonical path, size, and mtime
            const sizeMatches = existingAsset.sizeBytes === file.sizeBytes;
            const mtimeMatches = existingAsset.mtime.getTime() === file.mtime.getTime();
            const wasPresent = existingAsset.present;

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
            }
            // If matches and was present: unchanged (idempotent no-op)
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

            createdCount++;
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

  async listItems(options: ListMoviesOptions = {}): Promise<MovieWithEditions[]> {
    return this.repo.listMovies(options);
  }

  async getItem(id: string): Promise<MovieWithEditions | null> {
    return this.repo.getMovie(id);
  }
}

export const defaultInventoryService = new InventoryService();
