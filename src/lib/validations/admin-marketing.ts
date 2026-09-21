import { z } from 'zod';

export const createMarketingLinkSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name cannot exceed 100 characters'),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(50, 'Code cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Code can only contain letters, numbers, hyphens, and underscores'),
  destinationUrl: z.string().trim().optional().default('/'),
  isActive: z.boolean().optional().default(true),
  userId: z.string().optional().nullable(),
});

export const updateMarketingLinkSchema = z.object({
  id: z.string().uuid('Invalid marketing link ID'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name cannot exceed 100 characters').optional(),
  code: z
    .string()
    .trim()
    .min(2, 'Code must be at least 2 characters')
    .max(50, 'Code cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Code can only contain letters, numbers, hyphens, and underscores')
    .optional(),
  destinationUrl: z.string().trim().optional(),
  isActive: z.boolean().optional(),
  userId: z.string().optional().nullable(),
});

export type CreateMarketingLinkInput = z.infer<typeof createMarketingLinkSchema>;
export type UpdateMarketingLinkInput = z.infer<typeof updateMarketingLinkSchema>;
