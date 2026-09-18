import { z } from 'zod';
import { ReviewStatus } from '@prisma/client';

export const reviewStatusEnum = z.nativeEnum(ReviewStatus);

export const updateReviewStatusSchema = z.object({
  reviewId: z.string().min(1, 'Review ID is required'),
  status: reviewStatusEnum,
});

export const reviewFilterSchema = z.object({
  search: z.string().optional(),
  status: z.union([z.literal('ALL'), reviewStatusEnum]).optional().default('ALL'),
  therapistId: z.string().optional().default('ALL'),
});

export type UpdateReviewStatusInput = z.infer<typeof updateReviewStatusSchema>;
export type ReviewFilterInput = z.infer<typeof reviewFilterSchema>;
