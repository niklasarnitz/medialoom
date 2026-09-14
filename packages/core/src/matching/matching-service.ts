import type {
  CandidateMatchEvaluation,
  ItemMatchResult,
  MovieMetadataCandidate,
  ScoreComponents,
} from '@medialoom/contracts';
import { itemMatchResultSchema } from '@medialoom/contracts';
import {
  defaultInventoryRepository,
  type InventoryRepository,
  type MovieWithHierarchy,
} from '@medialoom/db';
import { defaultMetadataService, type MetadataService } from '../metadata/metadata-service';
import {
  DEFAULT_SCORING_CONFIG,
  type LocalMovieMetadata,
  MovieMatcher,
  type ScoringConfig,
} from './movie-matcher';

export interface MatchingServiceOptions {
  matcher?: MovieMatcher;
  metadataService?: MetadataService;
  inventoryRepo?: InventoryRepository;
  scoringConfig?: Partial<ScoringConfig>;
}

export function extractLocalMovieMetadata(item: MovieWithHierarchy): LocalMovieMetadata {
  let runtimeMinutes: number | null = null;

  // Search through editions -> mediaVersions -> assets for measured duration
  for (const edition of item.editions ?? []) {
    for (const version of edition.mediaVersions ?? []) {
      for (const asset of version.assets ?? []) {
        if (asset.technicalMetadata?.durationSeconds) {
          runtimeMinutes = Math.round(asset.technicalMetadata.durationSeconds / 60);
          break;
        }
      }
      if (runtimeMinutes !== null) break;
    }
    if (runtimeMinutes !== null) break;
  }

  return {
    title: item.title,
    year: item.year,
    runtimeMinutes,
  };
}

export class MatchingService {
  private matcher: MovieMatcher;
  private metadataService: MetadataService;
  private inventoryRepo: InventoryRepository;

  constructor(options: MatchingServiceOptions = {}) {
    this.matcher = options.matcher ?? new MovieMatcher(options.scoringConfig);
    this.metadataService = options.metadataService ?? defaultMetadataService;
    this.inventoryRepo = options.inventoryRepo ?? defaultInventoryRepository;
  }

  async evaluateItem(
    itemId: string,
    candidatesOverride?: MovieMetadataCandidate[],
  ): Promise<{
    item: MovieWithHierarchy;
    localMetadata: LocalMovieMetadata;
    candidates: MovieMetadataCandidate[];
    evaluations: CandidateMatchEvaluation[];
    decision: 'AUTO_MATCH' | 'REVIEW_REQUIRED' | 'UNMATCHED';
    selectedCandidate: MovieMetadataCandidate | null;
    topScore: number | null;
    components: ScoreComponents | null;
  }> {
    const item = await this.inventoryRepo.getMovie(itemId);
    if (!item) {
      throw new Error(`MediaItem "${itemId}" not found in inventory.`);
    }

    const localMetadata = extractLocalMovieMetadata(item);

    let candidates: MovieMetadataCandidate[];
    if (candidatesOverride) {
      candidates = candidatesOverride;
    } else {
      const result = await this.metadataService.getCandidatesForItem(itemId);
      candidates = result.candidates;
    }

    const evaluationResult = this.matcher.evaluateCandidates(localMetadata, candidates);

    return {
      item,
      localMetadata,
      candidates,
      evaluations: evaluationResult.evaluations,
      decision: evaluationResult.decision,
      selectedCandidate: evaluationResult.selectedCandidate,
      topScore: evaluationResult.topScore,
      components: evaluationResult.components,
    };
  }

  async matchItem(
    itemId: string,
    options: {
      candidatesOverride?: MovieMetadataCandidate[];
      fetchFullCanonical?: boolean;
    } = {},
  ): Promise<ItemMatchResult> {
    const evaluation = await this.evaluateItem(itemId, options.candidatesOverride);
    const { decision, selectedCandidate, topScore, components, evaluations, item } = evaluation;

    if (decision === 'AUTO_MATCH' && selectedCandidate) {
      // 1. Retrieve full canonical provider metadata (if available from provider)
      let canonical = selectedCandidate;
      if (options.fetchFullCanonical !== false && selectedCandidate.providerId) {
        try {
          const fullDetails = await this.metadataService.getMovie(selectedCandidate.providerId);
          if (fullDetails) {
            canonical = fullDetails;
          }
        } catch {
          // Fall back to candidate metadata if full retrieval fails
        }
      }

      // 2. Check if a Movie with this tmdbId already exists in database
      const tmdbId = canonical.tmdbId ?? Number.parseInt(canonical.providerId, 10);
      let targetMovieId = itemId;

      if (tmdbId) {
        const existingWithTmdb = await this.inventoryRepo.findMovieByTmdbId(tmdbId);
        if (existingWithTmdb && existingWithTmdb.id !== itemId) {
          await this.consolidateMovieIntoExisting(item, existingWithTmdb);
          targetMovieId = existingWithTmdb.id;
        }
      }

      const matchDetails = JSON.stringify({
        score: topScore,
        components,
        decision,
        reasons: evaluations[0]?.reasons ?? [],
        matchedAt: new Date().toISOString(),
        provider: canonical.provider,
        providerId: canonical.providerId,
      });

      await this.inventoryRepo.updateMovie(targetMovieId, {
        title: canonical.title,
        originalTitle: canonical.originalTitle ?? undefined,
        year: canonical.year ?? undefined,
        runtimeMinutes: canonical.runtimeMinutes ?? undefined,
        overview: canonical.overview ?? undefined,
        status: 'MATCHED',
        matchConfidence: topScore,
        matchDetails,
        tmdbId: tmdbId || undefined,
        imdbId: canonical.imdbId ?? undefined,
      });

      return itemMatchResultSchema.parse({
        itemId: targetMovieId,
        decision: 'AUTO_MATCH',
        score: topScore,
        components,
        selectedCandidate: canonical,
        evaluations,
        isManual: false,
      });
    }

    if (decision === 'REVIEW_REQUIRED') {
      const matchDetails = JSON.stringify({
        score: topScore,
        components,
        decision,
        reasons: evaluations[0]?.reasons ?? [],
        evaluatedAt: new Date().toISOString(),
      });

      await this.inventoryRepo.updateMovie(itemId, {
        status: 'REVIEW_REQUIRED',
        matchConfidence: topScore,
        matchDetails,
      });

      return itemMatchResultSchema.parse({
        itemId,
        decision: 'REVIEW_REQUIRED',
        score: topScore,
        components,
        selectedCandidate: null,
        evaluations,
        isManual: false,
      });
    }

    // UNMATCHED
    const matchDetails = JSON.stringify({
      score: topScore,
      components,
      decision: 'UNMATCHED',
      reasons: evaluations[0]?.reasons ?? ['No candidate met matching thresholds.'],
      evaluatedAt: new Date().toISOString(),
    });

    await this.inventoryRepo.updateMovie(itemId, {
      status: 'UNMATCHED',
      matchConfidence: topScore,
      matchDetails,
    });

    return itemMatchResultSchema.parse({
      itemId,
      decision: 'UNMATCHED',
      score: topScore,
      components,
      selectedCandidate: null,
      evaluations,
      isManual: false,
    });
  }

  async manualMatch(
    itemId: string,
    providerInfo: { provider: string; id: string | number },
  ): Promise<ItemMatchResult> {
    const item = await this.inventoryRepo.getMovie(itemId);
    if (!item) {
      throw new Error(`MediaItem "${itemId}" not found in inventory.`);
    }

    // Fetch canonical provider metadata before association
    const canonical = await this.metadataService.getMovie(providerInfo.id);
    if (!canonical) {
      throw new Error(
        `Provider "${providerInfo.provider}" could not find movie with ID "${providerInfo.id}".`,
      );
    }

    const tmdbId = canonical.tmdbId ?? Number.parseInt(String(providerInfo.id), 10);
    let targetMovieId = itemId;

    if (tmdbId) {
      const existingWithTmdb = await this.inventoryRepo.findMovieByTmdbId(tmdbId);
      if (existingWithTmdb && existingWithTmdb.id !== itemId) {
        await this.consolidateMovieIntoExisting(item, existingWithTmdb);
        targetMovieId = existingWithTmdb.id;
      }
    }

    const components: ScoreComponents = {
      title: DEFAULT_SCORING_CONFIG.titleWeight,
      year: DEFAULT_SCORING_CONFIG.yearWeight,
      runtime: DEFAULT_SCORING_CONFIG.runtimeWeight,
      providerRank: DEFAULT_SCORING_CONFIG.providerRankWeight,
      penalty: 0,
    };

    const matchDetails = JSON.stringify({
      score: 1.0,
      components,
      decision: 'AUTO_MATCH',
      isManual: true,
      matchedAt: new Date().toISOString(),
      provider: providerInfo.provider,
      providerId: String(providerInfo.id),
      reasons: ['Manual match override by user.'],
    });

    await this.inventoryRepo.updateMovie(targetMovieId, {
      title: canonical.title,
      originalTitle: canonical.originalTitle ?? undefined,
      year: canonical.year ?? undefined,
      runtimeMinutes: canonical.runtimeMinutes ?? undefined,
      overview: canonical.overview ?? undefined,
      status: 'MATCHED',
      matchConfidence: 1.0,
      matchDetails,
      tmdbId: tmdbId || undefined,
      imdbId: canonical.imdbId ?? undefined,
    });

    return itemMatchResultSchema.parse({
      itemId: targetMovieId,
      decision: 'AUTO_MATCH',
      score: 1.0,
      components,
      selectedCandidate: canonical,
      evaluations: [],
      isManual: true,
    });
  }

  private async consolidateMovieIntoExisting(
    sourceItem: MovieWithHierarchy,
    targetMovie: MovieWithHierarchy,
  ): Promise<void> {
    for (const edition of sourceItem.editions ?? []) {
      const sourceKey = (edition.normalizedName || edition.name || '').trim().toLowerCase();
      const targetEdition = (targetMovie.editions ?? []).find((e) => {
        const targetKey = (e.normalizedName || e.name || '').trim().toLowerCase();
        return targetKey === sourceKey;
      });

      if (targetEdition) {
        for (const version of edition.mediaVersions ?? []) {
          await this.inventoryRepo.updateMediaVersion(version.id, {
            editionId: targetEdition.id,
          });
        }
        await this.inventoryRepo.deleteEdition(edition.id);
      } else {
        await this.inventoryRepo.updateEdition(edition.id, {
          movieId: targetMovie.id,
        });
      }
    }

    await this.inventoryRepo.deleteMovie(sourceItem.id);
  }
}

export const defaultMatchingService = new MatchingService();
