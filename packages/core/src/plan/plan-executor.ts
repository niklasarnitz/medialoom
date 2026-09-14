import fs from 'node:fs';
import path from 'node:path';
import type { Operation, OperationPlanDto, ReviewQueueItemDto } from '@medialoom/contracts';
import {
  defaultInventoryRepository,
  defaultPlanRepository,
  defaultReviewRepository,
  type InventoryRepository,
  type OperationPlan,
  type PlanRepository,
  type ReviewQueueItem,
  type ReviewRepository,
} from '@medialoom/db';
import { ConflictError, DomainError, ReviewNotApprovedError, ReviewNotFoundError } from '../errors';

export interface PlanExecutorOptions {
  planRepo?: PlanRepository;
  reviewRepo?: ReviewRepository;
  inventoryRepo?: InventoryRepository;
}

export interface PlanExecutionResult {
  plan: OperationPlanDto;
  reviewItem: ReviewQueueItemDto;
  executedOperations: number;
}

export class PlanExecutor {
  private planRepo: PlanRepository;
  private reviewRepo: ReviewRepository;
  private inventoryRepo: InventoryRepository;

  constructor(options: PlanExecutorOptions = {}) {
    this.planRepo = options.planRepo ?? defaultPlanRepository;
    this.reviewRepo = options.reviewRepo ?? defaultReviewRepository;
    this.inventoryRepo = options.inventoryRepo ?? defaultInventoryRepository;
  }

  async executeReviewItem(reviewItemId: string): Promise<PlanExecutionResult> {
    const reviewItem = await this.reviewRepo.getReviewItem(reviewItemId);
    if (!reviewItem) {
      throw new ReviewNotFoundError(reviewItemId);
    }
    return this.executePlan(reviewItem.operationPlanId);
  }

  async executePlan(planId: string): Promise<PlanExecutionResult> {
    const planRecord = await this.planRepo.getPlan(planId);
    if (!planRecord) {
      throw new DomainError(`OperationPlan "${planId}" not found.`, {
        code: 'PLAN_NOT_FOUND',
        statusCode: 404,
        details: { planId },
      });
    }

    const reviewRecord = await this.reviewRepo.getReviewItemByPlanId(planId);
    if (!reviewRecord) {
      throw new ReviewNotApprovedError(
        `OperationPlan "${planId}" cannot be executed because no review item was found for it.`,
        { planId },
      );
    }

    if (reviewRecord.status !== 'APPROVED') {
      throw new ReviewNotApprovedError(
        `OperationPlan "${planId}" cannot be executed because ReviewQueueItem "${reviewRecord.id}" is in status "${reviewRecord.status}" (must be "APPROVED").`,
        { planId, reviewId: reviewRecord.id, status: reviewRecord.status },
      );
    }

    if (planRecord.status === 'APPLIED') {
      throw new ConflictError(`OperationPlan "${planId}" has already been applied.`, {
        planId,
        reviewId: reviewRecord.id,
      });
    }

    if (planRecord.status === 'FAILED') {
      throw new ConflictError(
        `Cannot execute failed OperationPlan "${planId}". Regenerate the plan first.`,
        { planId, reviewId: reviewRecord.id },
      );
    }

    const operations: Operation[] = JSON.parse(planRecord.operationsJson);

    // Pre-execution filesystem safety check
    this.preCheckOperations(operations);

    // Perform execution
    try {
      await this.applyOperations(operations);

      const now = new Date();
      const updatedPlan = await this.planRepo.updatePlan(planId, {
        status: 'APPLIED',
        appliedAt: now,
      });

      const updatedReview = await this.reviewRepo.updateReviewItem(reviewRecord.id, {
        status: 'APPLIED',
      });

      const planDto = this.deserializePlan(updatedPlan);
      const reviewDto = this.deserializeReviewItem(updatedReview, planDto);

      return {
        plan: planDto,
        reviewItem: reviewDto,
        executedOperations: operations.length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.planRepo.updatePlan(planId, {
        status: 'FAILED',
        failureReason: `Execution error: ${message}`,
      });
      await this.reviewRepo.updateReviewItem(reviewRecord.id, {
        status: 'FAILED',
      });
      throw err;
    }
  }

  private preCheckOperations(operations: Operation[]): void {
    for (const op of operations) {
      if (op.type === 'move') {
        if (!fs.existsSync(op.source)) {
          throw new ConflictError(`Execution aborted: source file does not exist: "${op.source}"`, {
            source: op.source,
            destination: op.destination,
          });
        }
        if (op.source !== op.destination && fs.existsSync(op.destination)) {
          throw new ConflictError(
            `Execution aborted: destination already exists: "${op.destination}"`,
            { source: op.source, destination: op.destination },
          );
        }
      }
    }
  }

  private async applyOperations(operations: Operation[]): Promise<void> {
    for (const op of operations) {
      if (op.type === 'mkdir') {
        fs.mkdirSync(op.path, { recursive: true });
      } else if (op.type === 'move') {
        if (op.source === op.destination) {
          continue;
        }
        const targetDir = path.dirname(op.destination);
        fs.mkdirSync(targetDir, { recursive: true });

        // Safe cross-device move fallback
        try {
          fs.renameSync(op.source, op.destination);
        } catch (err: unknown) {
          const renameErr = err as NodeJS.ErrnoException;
          if (renameErr && renameErr.code === 'EXDEV') {
            fs.copyFileSync(op.source, op.destination);
            fs.unlinkSync(op.source);
          } else {
            throw err;
          }
        }

        // Update database Asset path if corresponding asset exists
        await this.inventoryRepo.updateAssetPath(op.source, op.destination).catch(() => {});
      } else if (op.type === 'writeText') {
        const targetDir = path.dirname(op.path);
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(op.path, op.content, 'utf8');
      }
    }
  }

  private deserializePlan(record: OperationPlan): OperationPlanDto {
    const operations: Operation[] = JSON.parse(record.operationsJson);
    const validation = record.validationJson ? JSON.parse(record.validationJson) : null;
    return {
      id: record.id,
      mediaItemId: record.mediaItemId,
      profile: record.profile,
      destinationRoot: record.destinationRoot,
      status: record.status as OperationPlanDto['status'],
      operations,
      validation,
      failureReason: record.failureReason,
      createdAt: record.createdAt,
      validatedAt: record.validatedAt,
      appliedAt: record.appliedAt,
      updatedAt: record.updatedAt,
    };
  }

  private deserializeReviewItem(
    record: ReviewQueueItem,
    plan: OperationPlanDto | null,
  ): ReviewQueueItemDto {
    const details = record.detailsJson ? JSON.parse(record.detailsJson) : null;
    return {
      id: record.id,
      type: record.type as ReviewQueueItemDto['type'],
      status: record.status as ReviewQueueItemDto['status'],
      mediaItemId: record.mediaItemId,
      operationPlanId: record.operationPlanId,
      title: record.title,
      summary: record.summary,
      details,
      plan,
      createdAt: record.createdAt,
      reviewedAt: record.reviewedAt,
      approvedAt: record.approvedAt,
      rejectedAt: record.rejectedAt,
      updatedAt: record.updatedAt,
    };
  }
}

export const defaultPlanExecutor = new PlanExecutor();
