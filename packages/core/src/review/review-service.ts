import path from 'node:path';
import {
  type ListReviewQuery,
  type Operation,
  type OperationPlanDto,
  operationPlanDtoSchema,
  type ReviewItemDetails,
  type ReviewItemStatus,
  type ReviewItemType,
  type ReviewProposedDirectory,
  type ReviewProposedMove,
  type ReviewProposedWrite,
  type ReviewQueueItemDto,
  reviewItemDetailsSchema,
  reviewQueueItemDtoSchema,
} from '@medialoom/contracts';
import {
  defaultInventoryRepository,
  defaultPlanRepository,
  defaultReviewRepository,
  type InventoryRepository,
  type MovieWithHierarchy,
  type OperationPlan,
  type PlanRepository,
  type ReviewQueueItem,
  type ReviewRepository,
} from '@medialoom/db';
import { ConflictError, ReviewNotFoundError } from '../errors';
import {
  defaultPlanExecutor,
  type ExecutePlanOptions,
  type PlanExecutionResult,
  type PlanExecutor,
} from '../plan/plan-executor';

export interface ReviewServiceOptions {
  reviewRepo?: ReviewRepository;
  planRepo?: PlanRepository;
  inventoryRepo?: InventoryRepository;
  planExecutor?: PlanExecutor;
}

export class ReviewService {
  private reviewRepo: ReviewRepository;
  private planRepo: PlanRepository;
  private inventoryRepo: InventoryRepository;
  private planExecutor: PlanExecutor;

  constructor(options: ReviewServiceOptions = {}) {
    this.reviewRepo = options.reviewRepo ?? defaultReviewRepository;
    this.planRepo = options.planRepo ?? defaultPlanRepository;
    this.inventoryRepo = options.inventoryRepo ?? defaultInventoryRepository;
    this.planExecutor = options.planExecutor ?? defaultPlanExecutor;
  }

  async createReviewItemForPlan(
    plan: OperationPlanDto,
    movieInput?: MovieWithHierarchy | null,
  ): Promise<ReviewQueueItemDto> {
    const movie = movieInput ?? (await this.inventoryRepo.getMovie(plan.mediaItemId));

    const movieTitle = movie ? movie.title : 'Media Item';
    const yearStr = movie?.year ? ` (${movie.year})` : '';
    const title = `Reorganize: ${movieTitle}${yearStr}`;

    const directoriesToCreate: ReviewProposedDirectory[] = [];
    const filesToMove: ReviewProposedMove[] = [];
    const filesToWrite: ReviewProposedWrite[] = [];
    const versionNamingChanges: string[] = [];

    for (const op of plan.operations) {
      if (op.type === 'mkdir') {
        directoriesToCreate.push({ path: op.path });
      } else if (op.type === 'move') {
        const moveItem: ReviewProposedMove = {
          source: op.source,
          destination: op.destination,
        };
        if (op.metadata?.versionLabel && typeof op.metadata.versionLabel === 'string') {
          moveItem.versionLabel = op.metadata.versionLabel;
          versionNamingChanges.push(`Version: ${op.metadata.versionLabel}`);
        }
        if (op.metadata?.edition && typeof op.metadata.edition === 'string') {
          moveItem.edition = op.metadata.edition;
          versionNamingChanges.push(`Edition: ${op.metadata.edition}`);
        }
        filesToMove.push(moveItem);
      } else if (op.type === 'writeText') {
        filesToWrite.push({
          path: op.path,
          filename: path.basename(op.path),
          type: op.path.endsWith('.nfo') ? 'nfo' : 'text',
          sizeChars: op.content.length,
        });
      }
    }

    const warnings: string[] = [];
    const conflicts: string[] = [];

    if (plan.validation?.issues) {
      for (const issue of plan.validation.issues) {
        if (issue.severity === 'error') {
          conflicts.push(`[${issue.code}] ${issue.message}`);
        } else {
          warnings.push(`[${issue.code}] ${issue.message}`);
        }
      }
    }

    const details: ReviewItemDetails = {
      affectedMovie: movie
        ? {
            id: movie.id,
            title: movie.title,
            year: movie.year,
            status: movie.status,
          }
        : undefined,
      reason: `Reorganize media files according to ${plan.profile} layout`,
      destinationRoot: plan.destinationRoot,
      directoriesToCreate,
      filesToMove,
      filesToWrite,
      versionNamingChanges,
      validation: plan.validation ?? null,
      warnings,
      conflicts,
    };

    const summary = this.buildSummaryString({
      movieTitle,
      yearStr,
      filesToMove,
      filesToWrite,
    });

    const record = await this.reviewRepo.createReviewItem({
      type: 'FILESYSTEM_CHANGE',
      status: 'PENDING',
      mediaItemId: movie?.id ?? plan.mediaItemId,
      operationPlanId: plan.id,
      title,
      summary,
      detailsJson: JSON.stringify(details),
    });

    return this.mapToDto(record, details, plan);
  }

  async getReviewItem(id: string): Promise<ReviewQueueItemDto | null> {
    const record = await this.reviewRepo.getReviewItem(id);
    if (!record) {
      return null;
    }
    const planRecord = await this.planRepo.getPlan(record.operationPlanId);
    const plan = planRecord ? this.deserializePlan(planRecord) : null;
    const details = record.detailsJson ? JSON.parse(record.detailsJson) : null;
    return this.mapToDto(record, details, plan);
  }

  async getReviewItemByPlanId(planId: string): Promise<ReviewQueueItemDto | null> {
    const record = await this.reviewRepo.getReviewItemByPlanId(planId);
    if (!record) {
      return null;
    }
    const planRecord = await this.planRepo.getPlan(record.operationPlanId);
    const plan = planRecord ? this.deserializePlan(planRecord) : null;
    const details = record.detailsJson ? JSON.parse(record.detailsJson) : null;
    return this.mapToDto(record, details, plan);
  }

  async listReviewItems(query: ListReviewQuery = {}): Promise<ReviewQueueItemDto[]> {
    const records = await this.reviewRepo.listReviewItems(query);
    const results: ReviewQueueItemDto[] = [];

    for (const record of records) {
      const details = record.detailsJson ? JSON.parse(record.detailsJson) : null;
      results.push(this.mapToDto(record, details, null));
    }

    return results;
  }

  async approveReviewItem(id: string): Promise<ReviewQueueItemDto> {
    const record = await this.reviewRepo.getReviewItem(id);
    if (!record) {
      throw new ReviewNotFoundError(id);
    }

    if (record.status === 'APPLIED') {
      throw new ConflictError(`Review item "${id}" has already been applied.`);
    }

    const now = new Date();
    const updated = await this.reviewRepo.updateReviewItem(id, {
      status: 'APPROVED',
      approvedAt: now,
      reviewedAt: now,
    });

    const planRecord = await this.planRepo.getPlan(updated.operationPlanId);
    const plan = planRecord ? this.deserializePlan(planRecord) : null;
    const details = updated.detailsJson ? JSON.parse(updated.detailsJson) : null;

    return this.mapToDto(updated, details, plan);
  }

  async rejectReviewItem(id: string): Promise<ReviewQueueItemDto> {
    const record = await this.reviewRepo.getReviewItem(id);
    if (!record) {
      throw new ReviewNotFoundError(id);
    }

    if (record.status === 'APPLIED') {
      throw new ConflictError(
        `Cannot reject review item "${id}" because it has already been applied.`,
      );
    }

    const now = new Date();
    const updated = await this.reviewRepo.updateReviewItem(id, {
      status: 'REJECTED',
      rejectedAt: now,
      reviewedAt: now,
    });

    const planRecord = await this.planRepo.getPlan(updated.operationPlanId);
    const plan = planRecord ? this.deserializePlan(planRecord) : null;
    const details = updated.detailsJson ? JSON.parse(updated.detailsJson) : null;

    return this.mapToDto(updated, details, plan);
  }

  async applyApprovedReviewItem(
    id: string,
    options: ExecutePlanOptions = {},
  ): Promise<PlanExecutionResult> {
    return this.planExecutor.applyApprovedReviewItem(id, options);
  }

  private buildSummaryString(params: {
    movieTitle: string;
    yearStr: string;
    filesToMove: ReviewProposedMove[];
    filesToWrite: ReviewProposedWrite[];
  }): string {
    const totalFiles = params.filesToMove.length + params.filesToWrite.length;
    const lines: string[] = [
      `${params.movieTitle}${params.yearStr}`,
      '',
      `${totalFiles} ${totalFiles === 1 ? 'file' : 'files'} will be reorganized:`,
      '',
    ];

    for (const m of params.filesToMove) {
      lines.push('MOVE');
      lines.push(m.source);
      lines.push('→');
      lines.push(m.destination);
      lines.push('');
    }

    for (const w of params.filesToWrite) {
      lines.push('WRITE');
      lines.push(w.filename);
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  private deserializePlan(record: OperationPlan): OperationPlanDto {
    const operations: Operation[] = JSON.parse(record.operationsJson);
    const validation = record.validationJson ? JSON.parse(record.validationJson) : null;
    return operationPlanDtoSchema.parse({
      id: record.id,
      mediaItemId: record.mediaItemId,
      profile: record.profile,
      destinationRoot: record.destinationRoot,
      status: record.status,
      operations,
      validation,
      failureReason: record.failureReason,
      createdAt: record.createdAt,
      validatedAt: record.validatedAt,
      appliedAt: record.appliedAt,
      updatedAt: record.updatedAt,
    });
  }

  private mapToDto(
    record: ReviewQueueItem,
    details: ReviewItemDetails | null,
    plan: OperationPlanDto | null,
  ): ReviewQueueItemDto {
    return reviewQueueItemDtoSchema.parse({
      id: record.id,
      type: record.type as ReviewItemType,
      status: record.status as ReviewItemStatus,
      mediaItemId: record.mediaItemId,
      operationPlanId: record.operationPlanId,
      title: record.title,
      summary: record.summary,
      details: details ? reviewItemDetailsSchema.parse(details) : null,
      plan,
      createdAt: record.createdAt,
      reviewedAt: record.reviewedAt,
      approvedAt: record.approvedAt,
      rejectedAt: record.rejectedAt,
      updatedAt: record.updatedAt,
    });
  }
}

export const defaultReviewService = new ReviewService();
