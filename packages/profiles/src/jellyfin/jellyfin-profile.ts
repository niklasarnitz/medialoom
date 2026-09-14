import path from 'node:path';
import {
  type MovieLayoutPlan,
  type MovieMediaFilePlan,
  movieLayoutPlanSchema,
} from '@medialoom/contracts';
import type { MediaVersionWithHierarchy } from '@medialoom/db';
import { resolveContainedPath, sanitizePathComponent } from '../sanitizer/path-sanitizer';
import type { MovieOutputProfile, MovieProfileInput } from '../types';
import { generateDeterministicMovieNfo } from './jellyfin-nfo';
import { extractVersionDescriptor, resolveVersionLabels } from './version-label';

export class JellyfinMovieProfile implements MovieOutputProfile {
  readonly name = 'jellyfin';

  generateMovieLayout(input: MovieProfileInput): MovieLayoutPlan {
    const { movie, destinationRoot, editionId, versionId, sourcePathOverride } = input;

    // 1. Sanitize title and build directory base name
    const sanitizedTitle = sanitizePathComponent(movie.title, 'Unknown Movie');
    const yearPart = movie.year ? ` (${movie.year})` : '';
    const tmdbPart = movie.tmdbId ? ` [tmdbid-${movie.tmdbId}]` : '';
    const folderName = `${sanitizedTitle}${yearPart}${tmdbPart}`;
    const destinationDirectory = resolveContainedPath(destinationRoot, folderName);

    // 2. Collect versions to plan
    const collectedVersions: MediaVersionWithHierarchy[] = [];
    if (movie.editions) {
      for (const edition of movie.editions) {
        if (editionId && edition.id !== editionId) continue;
        for (const version of edition.mediaVersions ?? []) {
          if (versionId && version.id !== versionId) continue;
          collectedVersions.push(version);
        }
      }
    }

    const mediaFiles: MovieMediaFilePlan[] = [];

    if (sourcePathOverride) {
      const ext = path.extname(sourcePathOverride) || '.mkv';
      const mediaFilename = `${folderName}${ext}`;
      const destinationMediaPath = resolveContainedPath(destinationRoot, folderName, mediaFilename);
      const relativeMediaPath = path.posix.join(folderName, mediaFilename);

      mediaFiles.push({
        mediaFilename,
        relativeMediaPath,
        destinationMediaPath,
        sourceMediaPath: sourcePathOverride,
      });
    } else if (collectedVersions.length > 0) {
      const descriptors = collectedVersions.map(extractVersionDescriptor);
      const resolvedLabels = resolveVersionLabels(descriptors);
      const isMultiVersion = collectedVersions.length > 1;

      for (const version of collectedVersions) {
        const primaryAsset = version.assets[0];
        const sourcePath = primaryAsset?.path ?? null;
        const ext = sourcePath ? path.extname(sourcePath) || '.mkv' : '.mkv';
        const label = resolvedLabels.get(version.id);

        const mediaFilename =
          isMultiVersion && label ? `${folderName} - ${label}${ext}` : `${folderName}${ext}`;

        const destinationMediaPath = resolveContainedPath(
          destinationRoot,
          folderName,
          mediaFilename,
        );
        const relativeMediaPath = path.posix.join(folderName, mediaFilename);

        mediaFiles.push({
          mediaVersionId: version.id,
          assetId: primaryAsset?.id,
          versionLabel: isMultiVersion ? label : undefined,
          mediaFilename,
          relativeMediaPath,
          destinationMediaPath,
          sourceMediaPath: sourcePath,
        });
      }
    } else {
      // Fallback if movie has no registered assets/versions
      const mediaFilename = `${folderName}.mkv`;
      const destinationMediaPath = resolveContainedPath(destinationRoot, folderName, mediaFilename);
      const relativeMediaPath = path.posix.join(folderName, mediaFilename);

      mediaFiles.push({
        mediaFilename,
        relativeMediaPath,
        destinationMediaPath,
        sourceMediaPath: null,
      });
    }

    // 3. Primary media file references for compatibility
    const primaryMediaFile = mediaFiles[0] as MovieMediaFilePlan;
    const mediaFilename = primaryMediaFile.mediaFilename;
    const relativeMediaPath = primaryMediaFile.relativeMediaPath;
    const destinationMediaPath = primaryMediaFile.destinationMediaPath;
    const sourceMediaPath = primaryMediaFile.sourceMediaPath ?? null;

    // 4. Generate deterministic shared movie.nfo content
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
      mediaFiles,
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
