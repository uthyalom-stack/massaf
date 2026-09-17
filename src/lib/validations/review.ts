import { z } from 'zod';

export const reviewSchema = z.object({
  bookingId: z.string().trim().min(1, 'Booking reference is required'),
  rating: z
    .number({
      message: 'Rating is required and must be a number',
    })
    .int('Rating must be a whole number')
    .min(1, 'Rating must be at least 1 star')
    .max(5, 'Rating cannot exceed 5 stars'),
  comment: z
    .string()
    .trim()
    .max(1000, 'Comment must not exceed 1000 characters')
    .optional()
    .or(z.literal('')),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
