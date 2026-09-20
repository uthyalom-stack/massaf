import { z } from 'zod';

export const matchCriteriaSchema = z.object({
  serviceId: z.string().min(1, 'Please select a massage service.'),
  locationType: z.enum(['STUDIO', 'IN_HOME'], {
    message: 'Please select a location type (In-Home or Studio).',
  }),
  locationQuery: z.string().optional().default(''),
  zipCode: z
    .string()
    .optional()
    .default('')
    .refine(
      (val) => !val || /^\d{5}(-\d{4})?$/.test(val.trim()),
      'Please enter a valid 5-digit U.S. ZIP code.'
    ),
  maxBudget: z
    .number()
    .positive('Budget must be a positive amount.')
    .nullable()
    .optional(),
  preferredDate: z
    .string()
    .optional()
    .default('')
    .refine(
      (val) => !val || !isNaN(Date.parse(val)),
      'Invalid date format.'
    ),
  preferredTime: z.string().optional().default(''),
});

export type MatchCriteria = z.infer<typeof matchCriteriaSchema>;
