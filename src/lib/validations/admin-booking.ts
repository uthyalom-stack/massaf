import { z } from 'zod';
import { BookingStatus } from '@prisma/client';

export const bookingStatusEnum = z.nativeEnum(BookingStatus);

export const updateBookingStatusSchema = z.object({
  bookingId: z.string().min(1, 'Booking ID is required'),
  status: bookingStatusEnum,
});

export const assignBookingTherapistSchema = z.object({
  bookingId: z.string().min(1, 'Booking ID is required'),
  therapistId: z.string().min(1, 'Therapist ID is required'),
});

export const cancelBookingSchema = z.object({
  bookingId: z.string().min(1, 'Booking ID is required'),
  reason: z.string().trim().optional(),
});

export const bookingFilterSchema = z.object({
  search: z.string().optional(),
  status: z.union([z.literal('ALL'), bookingStatusEnum]).optional().default('ALL'),
  dateFilter: z.enum(['ALL', 'TODAY', 'UPCOMING', 'PAST']).optional().default('ALL'),
});

export type UpdateBookingStatusInput = z.infer<typeof updateBookingStatusSchema>;
export type AssignBookingTherapistInput = z.infer<typeof assignBookingTherapistSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type BookingFilterInput = z.infer<typeof bookingFilterSchema>;
