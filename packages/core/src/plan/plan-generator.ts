import type { MovieLayoutPlan, Operation } from '@medialoom/contracts';
import { operationSchema } from '@medialoom/contracts';
import type { MovieWithHierarchy } from '@medialoom/db';
import { getMovieProfile } from '@medialoom/profiles';

export interface GeneratePlanOperationsOptions {
  movie: MovieWithHierarchy;
  destinationRoot: string;
  profile?: string;
  editionId?: string;
  versionId?: string;
  sourcePathOverride?: string;
}

export class PlanGenerator {
  generateOperations(options: GeneratePlanOperationsOptions): {
    operations: Operation[];
    layout: MovieLayoutPlan;
  } {
    const profileName = options.profile ?? 'jellyfin';
    const profile = getMovieProfile(profileName);
    if (!profile) {
      throw new Error(`Output profile "${profileName}" is not supported.`);
    }

    const layout = profile.generateMovieLayout({
      movie: options.movie,
      destinationRoot: options.destinationRoot,
      editionId: options.editionId,
      versionId: options.versionId,
      sourcePathOverride: options.sourcePathOverride,
    });

    const operations: Operation[] = [];

    // 1. mkdir for the movie destination directory
    operations.push(
      operationSchema.parse({
        type: 'mkdir',
        path: layout.destinationDirectory,
        metadata: {
          directory: layout.directory,
        },
      }),
    );

    // 2. move for each media file (if source exists or is specified)
    const mediaFiles =
      layout.mediaFiles && layout.mediaFiles.length > 0
        ? layout.mediaFiles
        : layout.sourceMediaPath
          ? [
              {
                mediaFilename: layout.mediaFilename,
                relativeMediaPath: layout.relativeMediaPath,
                destinationMediaPath: layout.destinationMediaPath,
                sourceMediaPath: layout.sourceMediaPath,
              },
            ]
          : [];

    for (const mediaFile of mediaFiles) {
      if (mediaFile.sourceMediaPath) {
        const metadata: Record<string, unknown> = {
          filename: mediaFile.mediaFilename,
          relativeMediaPath: mediaFile.relativeMediaPath,
        };
        if (mediaFile.versionLabel) {
          metadata.versionLabel = mediaFile.versionLabel;
          if (mediaFile.mediaVersionId) {
            metadata.mediaVersionId = mediaFile.mediaVersionId;
          }
          if (mediaFile.assetId) {
            metadata.assetId = mediaFile.assetId;
          }
        }

        operations.push(
          operationSchema.parse({
            type: 'move',
            source: mediaFile.sourceMediaPath,
            destination: mediaFile.destinationMediaPath,
            metadata,
          }),
        );
      }
    }

    // 3. writeText for all sidecars (e.g. movie.nfo)
    for (const sidecar of layout.sidecars) {
      operations.push(
        operationSchema.parse({
          type: 'writeText',
          path: sidecar.destinationPath,
          content: sidecar.content,
          metadata: {
            filename: sidecar.filename,
            sidecarType: sidecar.type,
            relativePath: sidecar.relativePath,
          },
        }),
      );
    }

    return { operations, layout };
  }
}

export const defaultPlanGenerator = new PlanGenerator();
