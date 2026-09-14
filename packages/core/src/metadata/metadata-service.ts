import {
  type MovieMetadataCandidate,
  type MovieSearchQuery,
} from '@medialoom/contracts';
import {
  defaultInventoryRepository,
  defaultSettingsRepository,
  type InventoryRepository,
  type MovieWithHierarchy,
  type SettingsRepository,
} from '@medialoom/db';
import {
  type MovieMetadataProvider,
  TmdbMovieProvider,
} from '@medialoom/providers';

export interface ItemCandidatesResult {
  item: MovieWithHierarchy;
  query: string;
  year?: number | null;
  candidates: MovieMetadataCandidate[];
}

export class MetadataService {
  private provider: MovieMetadataProvider;
  private inventoryRepo: InventoryRepository;
  private settingsRepo: SettingsRepository;

  constructor(
    provider?: MovieMetadataProvider,
    inventoryRepo?: InventoryRepository,
    settingsRepo?: SettingsRepository,
  ) {
    this.inventoryRepo = inventoryRepo ?? defaultInventoryRepository;
    this.settingsRepo = settingsRepo ?? defaultSettingsRepository;

    this.provider =
      provider ??
      new TmdbMovieProvider({
        getApiKey: () => this.settingsRepo.getTmdbApiKey(),
      });
  }

  async getCandidatesForItem(itemId: string): Promise<ItemCandidatesResult> {
    const item = await this.inventoryRepo.getMovie(itemId);
    if (!item) {
      throw new Error(`MediaItem "${itemId}" not found in inventory.`);
    }

    const query = item.title;
    const year = item.year ?? undefined;

    const candidates = await this.provider.searchMovies({
      query,
      year,
    });

    return {
      item,
      query,
      year: item.year,
      candidates,
    };
  }

  async searchMovies(query: MovieSearchQuery): Promise<MovieMetadataCandidate[]> {
    return this.provider.searchMovies(query);
  }

  async getMovie(providerId: string | number): Promise<MovieMetadataCandidate | null> {
    return this.provider.getMovie(providerId);
  }
}

export const defaultMetadataService = new MetadataService();
