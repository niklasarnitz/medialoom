import type { MovieLayoutPlan } from '@medialoom/contracts';
import { defaultInventoryRepository, type InventoryRepository } from '@medialoom/db';
import { getMovieProfile } from '@medialoom/profiles';

export interface LayoutServiceOptions {
  inventoryRepo?: InventoryRepository;
}

export class LayoutService {
  private inventoryRepo: InventoryRepository;

  constructor(options: LayoutServiceOptions = {}) {
    this.inventoryRepo = options.inventoryRepo ?? defaultInventoryRepository;
  }

  async generateMovieLayout(
    itemId: string,
    options: {
      profile?: string;
      destinationRoot: string;
      editionId?: string;
      versionId?: string;
    },
  ): Promise<MovieLayoutPlan> {
    const profileName = options.profile ?? 'jellyfin';
    const profile = getMovieProfile(profileName);
    if (!profile) {
      throw new Error(`Output profile "${profileName}" is not supported.`);
    }

    if (!options.destinationRoot) {
      throw new Error('Destination path is required.');
    }

    const movie = await this.inventoryRepo.getMovie(itemId);
    if (!movie) {
      throw new Error(`MediaItem "${itemId}" not found in inventory.`);
    }

    if (movie.status === 'UNMATCHED' || movie.status === 'ERROR') {
      throw new Error(
        `Cannot generate layout for unmatched movie "${movie.title}" (status: ${movie.status}).`,
      );
    }

    return profile.generateMovieLayout({
      movie,
      destinationRoot: options.destinationRoot,
      editionId: options.editionId,
      versionId: options.versionId,
    });
  }
}

export const defaultLayoutService = new LayoutService();
