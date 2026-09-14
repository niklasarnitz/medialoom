import fs from 'node:fs/promises';
import path from 'node:path';
import { type NormalizedFilenameMetadata, parseFilename } from '../parser/guessit-adapter';

/**
 * Supported video media extensions for recursive discovery.
 * Comparisons are performed case-insensitively.
 */
export const SUPPORTED_EXTENSIONS = new Set<string>([
  '.mkv',
  '.mp4',
  '.m4v',
  '.avi',
  '.mov',
  '.ts',
  '.m2ts',
]);

export interface DiscoveredMediaFile {
  /**
   * Canonical absolute path resolved via realpath.
   */
  path: string;
  /**
   * Path as originally encountered during filesystem traversal.
   */
  originalPath: string;
  /**
   * File size in bytes.
   */
  sizeBytes: number;
  /**
   * Last modified timestamp.
   */
  mtime: Date;
  /**
   * Lowercase extension including the leading dot (e.g. '.mkv').
   */
  extension: string;
  /**
   * Normalized filename metadata extracted via GuessIt adapter.
   */
  parsed: NormalizedFilenameMetadata;
}

export interface ScannerOptions {
  /**
   * Optional custom supported extensions set.
   */
  supportedExtensions?: Set<string>;
}

/**
 * Safe Symlink Handling Specification:
 * 1. Cycle Prevention: Directory traversals record the canonical realpath of every
 *    visited directory in a set. If a directory or symlink points to an already-visited
 *    directory, traversal does not recurse into it.
 * 2. Broken Symlinks: If a symlink points to a non-existent target or stat fails,
 *    it is silently and safely skipped without aborting discovery.
 * 3. File Target Verification: Only symlinks resolving to regular files with supported
 *    media extensions are included. Sockets, FIFOs, and devices are ignored.
 * 4. Read-Only Invariant: Scanning strictly performs stat/readdir operations.
 *    No filesystem modifications (writes, moves, touches, deletes) are ever executed.
 */
export class MediaScanner {
  private supportedExtensions: Set<string>;

  constructor(options: ScannerOptions = {}) {
    this.supportedExtensions = options.supportedExtensions ?? SUPPORTED_EXTENSIONS;
  }

  /**
   * Recursively discover all media files within the given directory path.
   */
  async discover(rootPath: string): Promise<DiscoveredMediaFile[]> {
    const canonicalRoot = await fs.realpath(path.resolve(rootPath));
    const stat = await fs.stat(canonicalRoot);
    if (!stat.isDirectory()) {
      throw new Error(`Scan path is not a directory: "${rootPath}"`);
    }

    const discovered: DiscoveredMediaFile[] = [];
    const visitedDirectories = new Set<string>();

    await this.traverseDirectory(canonicalRoot, visitedDirectories, discovered);

    // Sort deterministically by canonical path
    discovered.sort((a, b) => a.path.localeCompare(b.path));
    return discovered;
  }

  private async traverseDirectory(
    dirPath: string,
    visitedDirectories: Set<string>,
    results: DiscoveredMediaFile[],
  ): Promise<void> {
    let canonicalDir: string;
    try {
      canonicalDir = await fs.realpath(dirPath);
    } catch {
      // Inaccessible directory, skip gracefully
      return;
    }

    if (visitedDirectories.has(canonicalDir)) {
      // Cycle detected or directory already processed; stop recursion
      return;
    }
    visitedDirectories.add(canonicalDir);

    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      // Cannot read directory (e.g. permissions), skip gracefully
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.traverseDirectory(entryPath, visitedDirectories, results);
      } else if (entry.isSymbolicLink()) {
        try {
          const stat = await fs.stat(entryPath);
          if (stat.isDirectory()) {
            await this.traverseDirectory(entryPath, visitedDirectories, results);
          } else if (stat.isFile()) {
            await this.processFile(entryPath, stat, results);
          }
        } catch {
          // Broken symlink or inaccessible target; skip safely
        }
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(entryPath);
          await this.processFile(entryPath, stat, results);
        } catch {
          // Inaccessible file; skip safely
        }
      }
    }
  }

  private async processFile(
    filePath: string,
    stat: import('node:fs').Stats,
    results: DiscoveredMediaFile[],
  ): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    if (!this.supportedExtensions.has(ext)) {
      return;
    }

    let canonicalPath: string;
    try {
      canonicalPath = await fs.realpath(filePath);
    } catch {
      canonicalPath = path.resolve(filePath);
    }

    const filename = path.basename(filePath);
    const parsed = parseFilename(filename);

    results.push({
      path: canonicalPath,
      originalPath: filePath,
      sizeBytes: stat.size,
      mtime: stat.mtime,
      extension: ext,
      parsed,
    });
  }
}

export const defaultMediaScanner = new MediaScanner();

export function discoverMediaFiles(
  rootPath: string,
  options?: ScannerOptions,
): Promise<DiscoveredMediaFile[]> {
  const scanner = options ? new MediaScanner(options) : defaultMediaScanner;
  return scanner.discover(rootPath);
}
