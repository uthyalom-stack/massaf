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

export const createAdminReviewSchema = z.object({
  therapistId: z.string().min(1, 'Therapist selection is required'),
  authorName: z.string().min(2, 'Reviewer name must be at least 2 characters'),
  rating: z.number().int().min(1, 'Rating must be between 1 and 5 stars').max(5, 'Rating must be between 1 and 5 stars'),
  comment: z.string().min(3, 'Review comment must be at least 3 characters'),
  createdAt: z.string().optional(),
});

export type UpdateReviewStatusInput = z.infer<typeof updateReviewStatusSchema>;
export type ReviewFilterInput = z.infer<typeof reviewFilterSchema>;
export type CreateAdminReviewInput = z.infer<typeof createAdminReviewSchema>;
