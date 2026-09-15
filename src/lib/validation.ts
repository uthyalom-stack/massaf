import { z } from 'zod';

export const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Valid phone number required'),
});

export const serviceAreaSearchSchema = z.object({
  zipCode: z.string().length(5, 'ZIP code must be 5 digits').optional(),
  city: z.string().optional(),
  state: z.string().length(2, 'State code must be 2 characters').optional(),
});

export const bookingCreateSchema = z.object({
  customerId: z.string().uuid(),
  therapistId: z.string().uuid().optional(),
  serviceId: z.string().uuid(),
  appointmentDateTime: z.string().datetime(),
  durationMinutes: z.number().positive(),
  locationType: z.enum(['STUDIO', 'IN_HOME']),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  notes: z.string().optional(),
  marketingLinkId: z.string().uuid().optional(),
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type ServiceAreaSearchInput = z.infer<typeof serviceAreaSearchSchema>;
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
