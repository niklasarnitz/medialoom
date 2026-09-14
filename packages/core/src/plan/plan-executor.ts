import fs from 'node:fs';
import path from 'node:path';
import type {
  Operation,
  OperationExecutionRecord,
  OperationPlanDto,
  PlanExecutionResultDto,
  PlanValidationResult,
  ReviewQueueItemDto,
} from '@medialoom/contracts';
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
import { defaultPlanValidator, type PlanValidator } from './plan-validator';

export interface PlanExecutorOptions {
  planRepo?: PlanRepository;
  reviewRepo?: ReviewRepository;
  inventoryRepo?: InventoryRepository;
  validator?: PlanValidator;
}

export interface ExecutePlanOptions {
  dryRun?: boolean;
}

export type PlanExecutionResult = PlanExecutionResultDto;

export class PlanExecutor {
  private planRepo: PlanRepository;
  private reviewRepo: ReviewRepository;
  private inventoryRepo: InventoryRepository;
  private validator: PlanValidator;

  constructor(options: PlanExecutorOptions = {}) {
    this.planRepo = options.planRepo ?? defaultPlanRepository;
    this.reviewRepo = options.reviewRepo ?? defaultReviewRepository;
    this.inventoryRepo = options.inventoryRepo ?? defaultInventoryRepository;
    this.validator = options.validator ?? defaultPlanValidator;
  }

  async applyApprovedReviewItem(
    reviewItemId: string,
    options: ExecutePlanOptions = {},
  ): Promise<PlanExecutionResult> {
    const reviewItem = await this.reviewRepo.getReviewItem(reviewItemId);
    if (!reviewItem) {
      throw new ReviewNotFoundError(reviewItemId);
    }
    return this.executePlan(reviewItem.operationPlanId, options);
  }

  async executeReviewItem(
    reviewItemId: string,
    options: ExecutePlanOptions = {},
  ): Promise<PlanExecutionResult> {
    return this.applyApprovedReviewItem(reviewItemId, options);
  }

  async executePlan(
    planId: string,
    options: ExecutePlanOptions = {},
  ): Promise<PlanExecutionResult> {
    const isDryRun = options.dryRun === true;

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

    if (planRecord.status === 'APPLIED') {
      throw new ConflictError(`OperationPlan "${planId}" has already been applied.`, {
        planId,
        reviewId: reviewRecord.id,
      });
    }

    if (reviewRecord.status === 'REJECTED') {
      throw new ReviewNotApprovedError(
        `OperationPlan "${planId}" cannot be executed because ReviewQueueItem "${reviewRecord.id}" was REJECTED.`,
        { planId, reviewId: reviewRecord.id, status: reviewRecord.status },
      );
    }

    if (!isDryRun && reviewRecord.status !== 'APPROVED') {
      throw new ReviewNotApprovedError(
        `OperationPlan "${planId}" cannot be executed because ReviewQueueItem "${reviewRecord.id}" is in status "${reviewRecord.status}" (must be "APPROVED").`,
        { planId, reviewId: reviewRecord.id, status: reviewRecord.status },
      );
    }

    if (isDryRun && reviewRecord.status !== 'APPROVED' && reviewRecord.status !== 'PENDING') {
      throw new ReviewNotApprovedError(
        `Cannot dry run OperationPlan "${planId}" because ReviewQueueItem is in status "${reviewRecord.status}".`,
        { planId, reviewId: reviewRecord.id, status: reviewRecord.status },
      );
    }

    if (planRecord.status === 'FAILED') {
      throw new ConflictError(
        `Cannot execute failed OperationPlan "${planId}". Regenerate the plan first.`,
        { planId, reviewId: reviewRecord.id },
      );
    }

    const operations: Operation[] = JSON.parse(planRecord.operationsJson);

    // Live filesystem revalidation
    const liveValidation = await this.validator.validate({
      operations,
      destinationRoot: planRecord.destinationRoot,
    });

    if (!liveValidation.valid) {
      const errorSummary = liveValidation.issues
        .filter((i) => i.severity === 'error')
        .map((i) => `[${i.code}] ${i.message}`)
        .join('; ');

      if (!isDryRun) {
        // Mark both plan and review item as failed
        await this.planRepo.updatePlan(planId, {
          status: 'FAILED',
          failureReason: `Filesystem revalidation failed before execution: ${errorSummary}`,
          validationJson: JSON.stringify(liveValidation),
        });
        await this.reviewRepo.updateReviewItem(reviewRecord.id, {
          status: 'FAILED',
        });

        throw new ConflictError(
          `Execution aborted: reality changed on disk or conflicts appeared since plan was generated: ${errorSummary}`,
          { planId, reviewId: reviewRecord.id, validation: liveValidation },
        );
      }

      // In dry-run mode, return validation report without failing stored records
      const planDto = this.deserializePlan(planRecord);
      const reviewDto = this.deserializeReviewItem(reviewRecord, planDto);
      return {
        plan: planDto,
        reviewItem: reviewDto,
        dryRun: true,
        executedOperations: 0,
        operationResults: [],
        validation: liveValidation,
        message: `Dry run validation failed: ${errorSummary}`,
      };
    }

    if (isDryRun) {
      const planDto = this.deserializePlan(planRecord);
      const reviewDto = this.deserializeReviewItem(reviewRecord, planDto);
      const simulatedResults: OperationExecutionRecord[] = operations.map((op, idx) => ({
        index: idx,
        type: op.type,
        path: 'path' in op ? op.path : undefined,
        source: 'source' in op ? op.source : undefined,
        destination: 'destination' in op ? op.destination : undefined,
        status: 'succeeded',
        executedAt: new Date(),
      }));

      return {
        plan: planDto,
        reviewItem: reviewDto,
        dryRun: true,
        executedOperations: operations.length,
        operationResults: simulatedResults,
        validation: liveValidation,
        message: 'Dry run completed successfully. No filesystem changes were made.',
      };
    }

    // Live real execution
    const executionRecords: OperationExecutionRecord[] = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (!op) continue;

      const record: OperationExecutionRecord = {
        index: i,
        type: op.type,
        path: 'path' in op ? op.path : undefined,
        source: 'source' in op ? op.source : undefined,
        destination: 'destination' in op ? op.destination : undefined,
        status: 'succeeded',
        executedAt: new Date(),
      };

      try {
        if (op.type === 'mkdir') {
          fs.mkdirSync(op.path, { recursive: true });
        } else if (op.type === 'move') {
          if (op.source === op.destination) {
            // No-op
            executionRecords.push(record);
            continue;
          }

          // Safety checks immediately before move
          if (!fs.existsSync(op.source)) {
            throw new Error(`Source file missing: "${op.source}"`);
          }
          if (fs.existsSync(op.destination)) {
            throw new Error(`Destination already exists: "${op.destination}"`);
          }

          const targetDir = path.dirname(op.destination);
          fs.mkdirSync(targetDir, { recursive: true });

          try {
            fs.renameSync(op.source, op.destination);
          } catch (err: unknown) {
            const renameErr = err as NodeJS.ErrnoException;
            if (renameErr && renameErr.code === 'EXDEV') {
              // Cross-device fallback: copy -> verify size -> unlink
              fs.copyFileSync(op.source, op.destination);

              const srcStat = fs.statSync(op.source);
              const dstStat = fs.statSync(op.destination);

              if (srcStat.size !== dstStat.size) {
                // Remove incomplete destination file
                try {
                  fs.unlinkSync(op.destination);
                } catch {}
                throw new Error(
                  `Cross-device copy size verification failed: source size ${srcStat.size} !== destination size ${dstStat.size}`,
                );
              }

              // Unlink source only after successful copy & verification
              fs.unlinkSync(op.source);
            } else {
              throw err;
            }
          }

          // Update asset path in inventory DB
          await this.inventoryRepo.updateAssetPath(op.source, op.destination).catch(() => {});
        } else if (op.type === 'writeText') {
          const targetDir = path.dirname(op.path);
          fs.mkdirSync(targetDir, { recursive: true });
          fs.writeFileSync(op.path, op.content, 'utf8');
        }

        executionRecords.push(record);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        record.status = 'failed';
        record.error = errorMsg;
        executionRecords.push(record);

        // Mark remaining operations as skipped
        for (let j = i + 1; j < operations.length; j++) {
          const remainingOp = operations[j];
          if (!remainingOp) continue;
          executionRecords.push({
            index: j,
            type: remainingOp.type,
            path: 'path' in remainingOp ? remainingOp.path : undefined,
            source: 'source' in remainingOp ? remainingOp.source : undefined,
            destination: 'destination' in remainingOp ? remainingOp.destination : undefined,
            status: 'skipped',
          });
        }

        // Update plan and review item to FAILED
        await this.planRepo.updatePlan(planId, {
          status: 'FAILED',
          failureReason: `Execution failed at operation #${i + 1} (${op.type}): ${errorMsg}`,
        });
        await this.reviewRepo.updateReviewItem(reviewRecord.id, {
          status: 'FAILED',
        });

        throw new ConflictError(
          `Execution partially failed at operation #${i + 1} (${op.type}): ${errorMsg}. ${i} operations completed before failure.`,
          {
            planId,
            reviewId: reviewRecord.id,
            failedOperationIndex: i,
            executedOperations: i,
            operationResults: executionRecords,
          },
        );
      }
    }

    const now = new Date();
    const updatedPlan = await this.planRepo.updatePlan(planId, {
      status: 'APPLIED',
      appliedAt: now,
      validatedAt: now,
      validationJson: JSON.stringify(liveValidation),
    });

    const updatedReview = await this.reviewRepo.updateReviewItem(reviewRecord.id, {
      status: 'APPLIED',
    });

    const planDto = this.deserializePlan(updatedPlan);
    const reviewDto = this.deserializeReviewItem(updatedReview, planDto);

    return {
      plan: planDto,
      reviewItem: reviewDto,
      dryRun: false,
      executedOperations: operations.length,
      operationResults: executionRecords,
      validation: liveValidation,
      message: 'Plan executed successfully.',
    };
  }

  private deserializePlan(record: OperationPlan): OperationPlanDto {
    const operations: Operation[] = JSON.parse(record.operationsJson);
    const validation: PlanValidationResult | null = record.validationJson
      ? JSON.parse(record.validationJson)
      : null;
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
