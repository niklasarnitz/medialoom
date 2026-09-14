import path from 'node:path';
import { type MovieLayoutPlan, movieLayoutPlanSchema } from '@medialoom/contracts';
import { resolveContainedPath, sanitizePathComponent } from '../sanitizer/path-sanitizer';
import type { MovieOutputProfile, MovieProfileInput } from '../types';
import { generateDeterministicMovieNfo } from './jellyfin-nfo';

export class JellyfinMovieProfile implements MovieOutputProfile {
  readonly name = 'jellyfin';

  generateMovieLayout(input: MovieProfileInput): MovieLayoutPlan {
    const { movie, destinationRoot, sourcePathOverride } = input;

    // 1. Determine source media path and extension
    let sourceMediaPath: string | null = sourcePathOverride ?? null;
    if (!sourceMediaPath && movie.editions) {
      for (const edition of movie.editions) {
        for (const version of edition.mediaVersions ?? []) {
          for (const asset of version.assets ?? []) {
            if (asset.path) {
              sourceMediaPath = asset.path;
              break;
            }
          }
          if (sourceMediaPath) break;
        }
        if (sourceMediaPath) break;
      }
    }

    const extension = sourceMediaPath ? path.extname(sourceMediaPath) || '.mkv' : '.mkv';

    // 2. Sanitize title and build directory/file base name
    const sanitizedTitle = sanitizePathComponent(movie.title, 'Unknown Movie');
    const yearPart = movie.year ? ` (${movie.year})` : '';
    const tmdbPart = movie.tmdbId ? ` [tmdbid-${movie.tmdbId}]` : '';

    const folderName = `${sanitizedTitle}${yearPart}${tmdbPart}`;
    const mediaFilename = `${folderName}${extension}`;

    // 3. Resolve destination paths and enforce destination-root containment
    const destinationDirectory = resolveContainedPath(destinationRoot, folderName);
    const destinationMediaPath = resolveContainedPath(destinationRoot, folderName, mediaFilename);
    const relativeMediaPath = path.posix.join(folderName, mediaFilename);

    // 4. Generate deterministic movie.nfo content
    const nfoContent = generateDeterministicMovieNfo({
      title: movie.title,
      originalTitle: movie.originalTitle,
      year: movie.year,
      overview: movie.overview,
      runtimeMinutes: movie.runtimeMinutes,
      tmdbId: movie.tmdbId,
      imdbId: movie.imdbId,
    });

    const nfoRelativePath = path.posix.join(folderName, 'movie.nfo');
    const nfoDestinationPath = resolveContainedPath(destinationRoot, folderName, 'movie.nfo');

    const sidecars = [
      {
        filename: 'movie.nfo',
        type: 'nfo',
        relativePath: nfoRelativePath,
        destinationPath: nfoDestinationPath,
        content: nfoContent,
      },
    ];

    const plan: MovieLayoutPlan = {
      profile: this.name,
      destinationRoot: path.resolve(destinationRoot),
      directory: folderName,
      destinationDirectory,
      mediaFilename,
      relativeMediaPath,
      destinationMediaPath,
      sourceMediaPath,
      sidecars,
    };

    return movieLayoutPlanSchema.parse(plan);
  }
}

export const defaultJellyfinMovieProfile = new JellyfinMovieProfile();
