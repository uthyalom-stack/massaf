import { db } from '@/lib/db';
import { MOCK_THERAPISTS } from '@/lib/mock-data';

/**
 * Ensures that the therapist and service records from mock data exist in the Prisma database.
 * This satisfies foreign key constraints for Booking records without disturbing mock data as the primary source of truth for Phase 5.
 */
export async function ensureTherapistAndServiceInDb(therapistId: string, serviceId: string) {
  const mockTherapist = MOCK_THERAPISTS.find((t) => t.id === therapistId);
  if (!mockTherapist) {
    throw new Error(`Therapist with ID '${therapistId}' not found.`);
  }

  const mockService = mockTherapist.services.find((s) => s.id === serviceId);
  if (!mockService) {
    throw new Error(`Service with ID '${serviceId}' not found for therapist '${therapistId}'.`);
  }

  // Upsert Therapist
  await db.therapist.upsert({
    where: { id: mockTherapist.id },
    update: {
      name: mockTherapist.name,
      bio: mockTherapist.bio,
      profileImage: mockTherapist.image,
      rating: mockTherapist.rating,
      reviewCount: mockTherapist.reviewCount,
      offersStudio: mockTherapist.offersStudio,
      offersInHome: mockTherapist.offersInHome,
      isFeatured: mockTherapist.isFeatured ?? false,
    },
    create: {
      id: mockTherapist.id,
      name: mockTherapist.name,
      bio: mockTherapist.bio,
      profileImage: mockTherapist.image,
      rating: mockTherapist.rating,
      reviewCount: mockTherapist.reviewCount,
      offersStudio: mockTherapist.offersStudio,
      offersInHome: mockTherapist.offersInHome,
      isFeatured: mockTherapist.isFeatured ?? false,
    },
  });

  // Upsert Service
  await db.service.upsert({
    where: { id: mockService.id },
    update: {
      name: mockService.name,
      description: mockService.description,
      durationMinutes: mockService.durationMinutes,
      price: mockService.price,
    },
    create: {
      id: mockService.id,
      name: mockService.name,
      description: mockService.description,
      durationMinutes: mockService.durationMinutes,
      price: mockService.price,
    },
  });

  // Upsert TherapistService relation
  const therapistServiceId = `${mockTherapist.id}_${mockService.id}`;
  await db.therapistService.upsert({
    where: {
      therapistId_serviceId: {
        therapistId: mockTherapist.id,
        serviceId: mockService.id,
      },
    },
    update: {},
    create: {
      id: therapistServiceId,
      therapistId: mockTherapist.id,
      serviceId: mockService.id,
    },
  });

  return {
    mockTherapist,
    mockService,
  };
}
