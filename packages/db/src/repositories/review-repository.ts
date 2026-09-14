import type { PrismaClient, ReviewQueueItem } from '@prisma/client';
import { getPrismaClient } from '../client';

export interface CreateReviewItemDbInput {
  id?: string;
  type?: string;
  status?: string;
  mediaItemId?: string | null;
  operationPlanId: string;
  title: string;
  summary: string;
  detailsJson?: string | null;
  reviewedAt?: Date | null;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
}

export interface UpdateReviewItemDbInput {
  status?: string;
  title?: string;
  summary?: string;
  detailsJson?: string | null;
  reviewedAt?: Date | null;
  approvedAt?: Date | null;
  rejectedAt?: Date | null;
}

export interface ListReviewItemsDbOptions {
  mediaItemId?: string;
  operationPlanId?: string;
  type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export class ReviewRepository {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? getPrismaClient();
  }

  async createReviewItem(input: CreateReviewItemDbInput): Promise<ReviewQueueItem> {
    return this.prisma.reviewQueueItem.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        type: input.type ?? 'FILESYSTEM_CHANGE',
        status: input.status ?? 'PENDING',
        mediaItemId: input.mediaItemId ?? null,
        operationPlanId: input.operationPlanId,
        title: input.title,
        summary: input.summary,
        detailsJson: input.detailsJson ?? null,
        reviewedAt: input.reviewedAt ?? null,
        approvedAt: input.approvedAt ?? null,
        rejectedAt: input.rejectedAt ?? null,
      },
    });
  }

  async getReviewItem(id: string): Promise<ReviewQueueItem | null> {
    return this.prisma.reviewQueueItem.findUnique({
      where: { id },
    });
  }

  async getReviewItemByPlanId(operationPlanId: string): Promise<ReviewQueueItem | null> {
    return this.prisma.reviewQueueItem.findUnique({
      where: { operationPlanId },
    });
  }

  async listReviewItems(options: ListReviewItemsDbOptions = {}): Promise<ReviewQueueItem[]> {
    return this.prisma.reviewQueueItem.findMany({
      where: {
        ...(options.mediaItemId ? { mediaItemId: options.mediaItemId } : {}),
        ...(options.operationPlanId ? { operationPlanId: options.operationPlanId } : {}),
        ...(options.type ? { type: options.type } : {}),
        ...(options.status ? { status: options.status } : {}),
      },
      take: options.limit,
      skip: options.offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateReviewItem(id: string, input: UpdateReviewItemDbInput): Promise<ReviewQueueItem> {
    return this.prisma.reviewQueueItem.update({
      where: { id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.detailsJson !== undefined ? { detailsJson: input.detailsJson } : {}),
        ...(input.reviewedAt !== undefined ? { reviewedAt: input.reviewedAt } : {}),
        ...(input.approvedAt !== undefined ? { approvedAt: input.approvedAt } : {}),
        ...(input.rejectedAt !== undefined ? { rejectedAt: input.rejectedAt } : {}),
      },
    });
  }

  async deleteReviewItem(id: string): Promise<ReviewQueueItem> {
    return this.prisma.reviewQueueItem.delete({
      where: { id },
    });
  }
}

export const defaultReviewRepository = new ReviewRepository();
