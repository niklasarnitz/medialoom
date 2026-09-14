import path from 'node:path';
import {
  type CreatePlanInput,
  createPlanRequestSchema,
  type ListPlansQuery,
  type Operation,
  type OperationPlanDto,
  operationPlanDtoSchema,
  type PlanValidationResult,
} from '@medialoom/contracts';

import {
  defaultInventoryRepository,
  defaultPlanRepository,
  type InventoryRepository,
  type OperationPlan,
  type PlanRepository,
  type ReviewRepository,
} from '@medialoom/db';
import { DomainError, ItemNotFoundError } from '../errors';
import { ReviewService, defaultReviewService } from '../review/review-service';
import { defaultPlanGenerator, type PlanGenerator } from './plan-generator';
import { defaultPlanValidator, type PlanValidator } from './plan-validator';

export interface PlanServiceOptions {
  inventoryRepo?: InventoryRepository;
  planRepo?: PlanRepository;
  reviewRepo?: ReviewRepository;
  reviewService?: ReviewService;
  generator?: PlanGenerator;
  validator?: PlanValidator;
}

export class PlanService {
  private inventoryRepo: InventoryRepository;
  private planRepo: PlanRepository;
  private reviewService: ReviewService;
  private generator: PlanGenerator;
  private validator: PlanValidator;

  constructor(options: PlanServiceOptions = {}) {
    this.inventoryRepo = options.inventoryRepo ?? defaultInventoryRepository;
    this.planRepo = options.planRepo ?? defaultPlanRepository;
    this.reviewService =
      options.reviewService ??
      (options.reviewRepo
        ? new ReviewService({
            reviewRepo: options.reviewRepo,
            planRepo: this.planRepo,
            inventoryRepo: this.inventoryRepo,
          })
        : defaultReviewService);
    this.generator = options.generator ?? defaultPlanGenerator;
    this.validator = options.validator ?? defaultPlanValidator;
  }

  async createPlan(rawInput: CreatePlanInput): Promise<OperationPlanDto> {
    const input = createPlanRequestSchema.parse(rawInput);
    const profileName = input.profile ?? 'jellyfin';
    const destinationRoot = path.resolve(input.destination);

    const movie = await this.inventoryRepo.getMovie(input.itemId);
    if (!movie) {
      throw new ItemNotFoundError(input.itemId);
    }

    if (movie.status === 'UNMATCHED' || movie.status === 'ERROR') {
      throw new DomainError(
        `Cannot generate layout plan for unmatched movie "${movie.title}" (status: ${movie.status}).`,
        {
          code: 'UNMATCHED',
          statusCode: 422,
          details: { itemId: movie.id, status: movie.status },
        },
      );
    }

    const { operations } = this.generator.generateOperations({
      movie,
      destinationRoot,
      profile: profileName,
    });

    let validation: PlanValidationResult | null = null;
    let status: 'PENDING' | 'VALIDATED' | 'FAILED' = 'PENDING';
    let validatedAt: Date | null = null;
    let failureReason: string | null = null;

    if (input.validate !== false) {
      validation = await this.validator.validate({
        operations,
        destinationRoot,
      });
      validatedAt = new Date();
      if (validation.valid) {
        status = 'VALIDATED';
      } else {
        status = 'FAILED';
        failureReason = validation.issues
          .filter((i) => i.severity === 'error')
          .map((i) => i.message)
          .join('; ');
      }
    }

    const record = await this.planRepo.createPlan({
      mediaItemId: movie.id,
      profile: profileName,
      destinationRoot,
      status,
      operationsJson: JSON.stringify(operations),
      validationJson: validation ? JSON.stringify(validation) : null,
      failureReason,
      validatedAt,
    });

    const planDto = this.mapToDto(record, operations, validation);
    await this.reviewService.createReviewItemForPlan(planDto, movie);

    return planDto;
  }

  async getPlan(id: string): Promise<OperationPlanDto | null> {
    const record = await this.planRepo.getPlan(id);
    if (!record) {
      return null;
    }
    return this.deserializePlan(record);
  }

  async listPlans(options: ListPlansQuery = {}): Promise<OperationPlanDto[]> {
    const records = await this.planRepo.listPlans(options);
    return records.map((r) => this.deserializePlan(r));
  }

  async validatePlan(id: string): Promise<OperationPlanDto> {
    const record = await this.planRepo.getPlan(id);
    if (!record) {
      throw new DomainError(`OperationPlan "${id}" not found.`, {
        code: 'PLAN_NOT_FOUND',
        statusCode: 404,
        details: { planId: id },
      });
    }

    const operations: Operation[] = JSON.parse(record.operationsJson);
    const validation = await this.validator.validate({
      operations,
      destinationRoot: record.destinationRoot,
    });

    const validatedAt = new Date();
    const status = validation.valid ? 'VALIDATED' : 'FAILED';
    const failureReason = validation.valid
      ? null
      : validation.issues
          .filter((i) => i.severity === 'error')
          .map((i) => i.message)
          .join('; ');

    const updated = await this.planRepo.updatePlan(id, {
      status,
      validatedAt,
      validationJson: JSON.stringify(validation),
      failureReason,
    });

    return this.mapToDto(updated, operations, validation);
  }

  private deserializePlan(record: OperationPlan): OperationPlanDto {
    const operations: Operation[] = JSON.parse(record.operationsJson);
    const validation: PlanValidationResult | null = record.validationJson
      ? JSON.parse(record.validationJson)
      : null;
    return this.mapToDto(record, operations, validation);
  }

  private mapToDto(
    record: OperationPlan,
    operations: Operation[],
    validation: PlanValidationResult | null,
  ): OperationPlanDto {
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
}

export const defaultPlanService = new PlanService();
