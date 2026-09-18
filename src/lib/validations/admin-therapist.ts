import { z } from 'zod';

export const therapistBaseSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  bio: z.string().optional().nullable(),
  profileImage: z.string().url('Invalid URL').optional().or(z.literal('')).nullable(),
  email: z.string().email('Invalid email address').optional().or(z.literal('')).nullable(),
  phone: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  offersStudio: z.boolean().default(true),
  offersInHome: z.boolean().default(true),
});

export type TherapistBaseInput = z.infer<typeof therapistBaseSchema>;

export const photoSchema = z.object({
  url: z.string().url('Must be a valid photo URL'),
  altText: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

export type PhotoInput = z.infer<typeof photoSchema>;

export const photoUpdateSchema = z.object({
  photoId: z.string().min(1, 'photoId is required'),
  url: z.string().url('Must be a valid photo URL').optional(),
  altText: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export type PhotoUpdateInput = z.infer<typeof photoUpdateSchema>;

export const therapistServiceSchema = z.object({
  serviceId: z.string().min(1, 'Service selection is required'),
  customPrice: z.number().positive('Price must be positive').optional().nullable(),
  customDurationMinutes: z.number().int().positive('Duration must be positive').optional().nullable(),
  isActive: z.boolean().default(true),
});

export type TherapistServiceInput = z.infer<typeof therapistServiceSchema>;

export const serviceAreaSchema = z.object({
  cityName: z.string().min(1, 'City name is required'),
  state: z.string().length(2, 'State must be a 2-letter postal code (e.g., CA, NY)').transform((val) => val.toUpperCase()),
  zipCode: z.string().min(5, 'ZIP code must be at least 5 digits'),
});

export type ServiceAreaInput = z.infer<typeof serviceAreaSchema>;

const timeFormatRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;

export const availabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  specificDate: z.string().optional().nullable(),
  startTime: z.string().regex(timeFormatRegex, 'Start time must be in HH:mm format (e.g. 09:00)'),
  endTime: z.string().regex(timeFormatRegex, 'End time must be in HH:mm format (e.g. 17:00)'),
  isUnavailable: z.boolean().default(false),
}).refine((data) => {
  if (data.startTime && data.endTime) {
    return data.startTime < data.endTime;
  }
  return true;
}, {
  message: 'Start time must be strictly before end time',
  path: ['endTime'],
});

export type AvailabilityInput = z.infer<typeof availabilitySchema>;

export const availabilityUpdateSchema = z.object({
  availabilityId: z.string().min(1, 'availabilityId is required'),
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  specificDate: z.string().optional().nullable(),
  startTime: z.string().regex(timeFormatRegex, 'Start time must be in HH:mm format (e.g. 09:00)'),
  endTime: z.string().regex(timeFormatRegex, 'End time must be in HH:mm format (e.g. 17:00)'),
  isUnavailable: z.boolean().default(false),
}).refine((data) => {
  if (data.startTime && data.endTime) {
    return data.startTime < data.endTime;
  }
  return true;
}, {
  message: 'Start time must be strictly before end time',
  path: ['endTime'],
});

export type AvailabilityUpdateInput = z.infer<typeof availabilityUpdateSchema>;
