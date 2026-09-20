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
  preferredTime: z
    .string()
    .optional()
    .default('')
    .refine((val) => {
      if (!val || !val.trim()) return true;
      const clean = val.trim();
      if (['morning', 'afternoon', 'evening'].includes(clean.toLowerCase())) {
        return true;
      }
      return /^(\d{1,2}):(\d{2})(\s*(AM|PM))?$/i.test(clean);
    }, 'Please select or enter a valid appointment time (e.g. 09:00, 2:30 PM, or morning/afternoon/evening).'),
});

export type MatchCriteria = z.infer<typeof matchCriteriaSchema>;
