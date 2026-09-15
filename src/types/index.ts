import type {
  Role,
  BookingStatus,
  ServiceLocationType,
  PaymentStatus,
  PaymentMethod,
  ReviewStatus,
} from '@prisma/client';

export type {
  Role,
  BookingStatus,
  ServiceLocationType,
  PaymentStatus,
  PaymentMethod,
  ReviewStatus,
};

export interface TherapistWithDetails {
  id: string;
  name: string;
  bio?: string | null;
  profileImage?: string | null;
  email?: string | null;
  phone?: string | null;
  rating: number;
  reviewCount: number;
  isActive: boolean;
  isFeatured: boolean;
  offersStudio: boolean;
  offersInHome: boolean;
}

export interface MarketingLinkSummary {
  id: string;
  name: string;
  code: string;
  destinationUrl: string;
  clicks: number;
  bookingsCount: number;
  totalRevenue: number;
}
