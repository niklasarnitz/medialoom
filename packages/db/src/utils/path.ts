import { normalize, resolve } from 'node:path';

/**
 * Canonicalizes an asset path at persistence boundaries using absolute normalized host paths.
 * Does NOT call realpath() so symlink resolution remains an explicit scanner policy.
 */
export function canonicalizeAssetPath(rawPath: string): string {
  return normalize(resolve(rawPath));
}
