import { z } from 'zod';

export const bookingSchema = z.object({
  therapistId: z.string().min(1, 'Therapist is required'),
  serviceId: z.string().min(1, 'Service selection is required'),
  durationMinutes: z.number().int().positive().optional(),
  locationType: z.enum(['STUDIO', 'IN_HOME']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please select a valid appointment date (YYYY-MM-DD)'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Please select a valid appointment time'),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email('Please enter a valid email address'),
  phone: z.string().trim().min(7, 'Please enter a valid phone number'),
  addressLine1: z.string().trim().optional(),
  addressLine2: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zipCode: z.string().trim().optional(),
  notes: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  if (data.locationType === 'IN_HOME') {
    if (!data.addressLine1 || data.addressLine1.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Street address is required for in-home appointments',
        path: ['addressLine1'],
      });
    }
    if (!data.city || data.city.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'City is required for in-home appointments',
        path: ['city'],
      });
    }
    if (!data.state || data.state.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'State is required for in-home appointments',
        path: ['state'],
      });
    }
    if (!data.zipCode || data.zipCode.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ZIP code is required for in-home appointments',
        path: ['zipCode'],
      });
    }
  }
});

export type BookingInput = z.infer<typeof bookingSchema>;
