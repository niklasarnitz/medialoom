import type { OperationPlan, PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../client';

export interface CreatePlanDbInput {
  id?: string;
  mediaItemId: string;
  profile: string;
  destinationRoot: string;
  status?: string;
  operationsJson: string;
  validationJson?: string | null;
  failureReason?: string | null;
  validatedAt?: Date | null;
  appliedAt?: Date | null;
}

export interface UpdatePlanDbInput {
  status?: string;
  operationsJson?: string;
  validationJson?: string | null;
  failureReason?: string | null;
  validatedAt?: Date | null;
  appliedAt?: Date | null;
}

export interface ListPlansDbOptions {
  mediaItemId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export class PlanRepository {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? getPrismaClient();
  }

  async createPlan(input: CreatePlanDbInput): Promise<OperationPlan> {
    return this.prisma.operationPlan.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        mediaItemId: input.mediaItemId,
        profile: input.profile,
        destinationRoot: input.destinationRoot,
        status: input.status ?? 'PENDING',
        operationsJson: input.operationsJson,
        validationJson: input.validationJson ?? null,
        failureReason: input.failureReason ?? null,
        validatedAt: input.validatedAt ?? null,
        appliedAt: input.appliedAt ?? null,
      },
    });
  }

  async getPlan(id: string): Promise<OperationPlan | null> {
    return this.prisma.operationPlan.findUnique({
      where: { id },
    });
  }

  async listPlans(options: ListPlansDbOptions = {}): Promise<OperationPlan[]> {
    return this.prisma.operationPlan.findMany({
      where: {
        ...(options.mediaItemId ? { mediaItemId: options.mediaItemId } : {}),
        ...(options.status ? { status: options.status } : {}),
      },
      take: options.limit,
      skip: options.offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updatePlan(id: string, input: UpdatePlanDbInput): Promise<OperationPlan> {
    return this.prisma.operationPlan.update({
      where: { id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.operationsJson !== undefined ? { operationsJson: input.operationsJson } : {}),
        ...(input.validationJson !== undefined ? { validationJson: input.validationJson } : {}),
        ...(input.failureReason !== undefined ? { failureReason: input.failureReason } : {}),
        ...(input.validatedAt !== undefined ? { validatedAt: input.validatedAt } : {}),
        ...(input.appliedAt !== undefined ? { appliedAt: input.appliedAt } : {}),
      },
    });
  }

  async deletePlan(id: string): Promise<OperationPlan> {
    return this.prisma.operationPlan.delete({
      where: { id },
    });
  }
}

export const defaultPlanRepository = new PlanRepository();
