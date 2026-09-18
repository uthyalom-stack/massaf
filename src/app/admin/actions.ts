'use server';

import { db } from '@/lib/db';
import {
  therapistBaseSchema,
  photoSchema,
  photoUpdateSchema,
  therapistServiceSchema,
  serviceAreaSchema,
  availabilitySchema,
  availabilityUpdateSchema,
} from '@/lib/validations/admin-therapist';
import {
  updateBookingStatusSchema,
  assignBookingTherapistSchema,
  cancelBookingSchema,
} from '@/lib/validations/admin-booking';
import { BookingStatus } from '@prisma/client';
import { MOCK_THERAPISTS } from '@/lib/mock-data';
import { revalidatePath } from 'next/cache';

/**
 * Server-side authorization check ensuring MASSAF_ADMIN_API_KEY is configured on the server.
 */
function checkServerAdminAuth() {
  const adminKey = process.env.MASSAF_ADMIN_API_KEY;
  if (!adminKey) {
    throw new Error('Server authorization configuration error: MASSAF_ADMIN_API_KEY is not configured.');
  }
}

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // revalidatePath throws when invoked outside of a Next.js server action request context (e.g., during testing)
  }
}

export async function createTherapistAction(input: unknown) {
  try {
    checkServerAdminAuth();
    const validated = therapistBaseSchema.parse(input);

    if (validated.email) {
      const existing = await db.therapist.findUnique({
        where: { email: validated.email },
      });
      if (existing) {
        return { success: false, error: 'A therapist with this email address already exists.' };
      }
    }

    const therapist = await db.therapist.create({
      data: {
        name: validated.name,
        bio: validated.bio || null,
        profileImage: validated.profileImage || null,
        email: validated.email || null,
        phone: validated.phone || null,
        isActive: validated.isActive,
        isFeatured: validated.isFeatured,
        offersStudio: validated.offersStudio,
        offersInHome: validated.offersInHome,
      },
    });

    revalidatePath('/admin/therapists');
    return { success: true, therapist };
  } catch (err: unknown) {
    console.error('Error in createTherapistAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create therapist record.',
    };
  }
}

// --- Bookings ---

/**
 * Validates whether a transition from currentStatus to newStatus is permissible.
 */
function isValidStatusTransition(currentStatus: BookingStatus, newStatus: BookingStatus): boolean {
  if (currentStatus === newStatus) return true;

  switch (currentStatus) {
    case 'PENDING':
      return ['CONFIRMED', 'ASSIGNED', 'CANCELLED', 'NO_SHOW'].includes(newStatus);
    case 'CONFIRMED':
      return ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(newStatus);
    case 'ASSIGNED':
      return ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(newStatus);
    case 'IN_PROGRESS':
      return ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(newStatus);
    case 'COMPLETED':
      return ['REFUNDED'].includes(newStatus);
    case 'NO_SHOW':
      return ['CANCELLED'].includes(newStatus);
    case 'CANCELLED':
    case 'REFUNDED':
      return false;
    default:
      return false;
  }
}

export async function updateBookingStatusAction(input: unknown) {
  try {
    checkServerAdminAuth();
    const validated = updateBookingStatusSchema.parse(input);

    const booking = await db.booking.findUnique({
      where: { id: validated.bookingId },
    });

    if (!booking) {
      return { success: false, error: 'Booking not found.' };
    }

    if (!isValidStatusTransition(booking.status, validated.status)) {
      return {
        success: false,
        error: `This booking cannot be moved to that status. Transitioning from ${booking.status} to ${validated.status} is not allowed.`,
      };
    }

    const updated = await db.booking.update({
      where: { id: validated.bookingId },
      data: { status: validated.status },
    });

    safeRevalidatePath('/admin');
    safeRevalidatePath('/admin/bookings');
    safeRevalidatePath(`/admin/bookings/${validated.bookingId}`);
    safeRevalidatePath('/admin');
    safeRevalidatePath('/admin/bookings');
    safeRevalidatePath(`/admin/bookings/${validated.bookingId}`);
    safeRevalidatePath('/admin');
    safeRevalidatePath('/admin/bookings');
    safeRevalidatePath(`/admin/bookings/${validated.bookingId}`);
    return { success: true, booking: updated };
  } catch (err: unknown) {
    console.error('Error in updateBookingStatusAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unable to update booking status. Please try again.',
    };
  }
}

export async function assignBookingTherapistAction(input: unknown) {
  try {
    checkServerAdminAuth();
    const validated = assignBookingTherapistSchema.parse(input);

    const booking = await db.booking.findUnique({
      where: { id: validated.bookingId },
      include: {
        service: true,
      },
    });

    if (!booking) {
      return { success: false, error: 'Booking not found.' };
    }

    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED' || booking.status === 'REFUNDED') {
      return {
        success: false,
        error: `Cannot assign therapist to a booking with status '${booking.status}'.`,
      };
    }

    // Check therapist existence & eligibility
    const therapist = await db.therapist.findUnique({
      where: { id: validated.therapistId },
      include: {
        services: true,
        serviceAreas: true,
      },
    });

    const mockTherapist = MOCK_THERAPISTS.find((t) => t.id === validated.therapistId);

    if (!therapist && !mockTherapist) {
      return { success: false, error: 'This therapist cannot be assigned to this booking.' };
    }

    const isActive = therapist ? therapist.isActive : (mockTherapist ? true : false);
    if (!isActive) {
      return { success: false, error: 'This therapist cannot be assigned to this booking.' };
    }

    const offersStudio = therapist ? therapist.offersStudio : (mockTherapist?.offersStudio ?? true);
    const offersInHome = therapist ? therapist.offersInHome : (mockTherapist?.offersInHome ?? true);

    if (booking.locationType === 'STUDIO' && !offersStudio) {
      return {
        success: false,
        error: 'This therapist cannot be assigned to this booking.',
      };
    }

    if (booking.locationType === 'IN_HOME' && !offersInHome) {
      return {
        success: false,
        error: 'This therapist cannot be assigned to this booking.',
      };
    }

    // Check service compatibility
    let offersService = false;
    if (therapist && therapist.services.length > 0) {
      offersService = therapist.services.some((ts) => ts.serviceId === booking.serviceId && ts.isActive);
    } else if (mockTherapist) {
      offersService = mockTherapist.services.some((s) => s.id === booking.serviceId);
    } else {
      // Therapist exists in DB without specific therapistService records linked
      offersService = true;
    }

    if (!offersService) {
      return {
        success: false,
        error: 'This therapist cannot be assigned to this booking.',
      };
    }

    // Check service area for IN_HOME bookings if therapist has serviceAreas configured
    if (booking.locationType === 'IN_HOME' && booking.zipCode && therapist && therapist.serviceAreas.length > 0) {
      const coversZip = therapist.serviceAreas.some(
        (sa) => sa.zipCode.trim() === booking.zipCode?.trim()
      );
      if (!coversZip) {
        return {
          success: false,
          error: 'This therapist cannot be assigned to this booking.',
        };
      }
    }

    // Ensure therapist record exists in DB if taken from mock data
    if (!therapist && mockTherapist) {
      await db.therapist.upsert({
        where: { id: mockTherapist.id },
        update: {},
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
    }

    const newStatus = booking.status === 'PENDING' ? 'ASSIGNED' : booking.status;

    const updated = await db.booking.update({
      where: { id: validated.bookingId },
      data: {
        therapistId: validated.therapistId,
        status: newStatus,
      },
    });

    safeRevalidatePath('/admin');
    safeRevalidatePath('/admin/bookings');
    safeRevalidatePath(`/admin/bookings/${validated.bookingId}`);
    return { success: true, booking: updated };
  } catch (err: unknown) {
    console.error('Error in assignBookingTherapistAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unable to assign therapist to booking. Please try again.',
    };
  }
}

export async function cancelBookingAction(input: unknown) {
  try {
    checkServerAdminAuth();
    const validated = cancelBookingSchema.parse(input);

    const booking = await db.booking.findUnique({
      where: { id: validated.bookingId },
    });

    if (!booking) {
      return { success: false, error: 'Booking not found.' };
    }

    if (booking.status === 'CANCELLED') {
      return { success: false, error: 'This booking is already cancelled.' };
    }

    if (booking.status === 'COMPLETED') {
      return { success: false, error: 'This booking cannot be cancelled because it is already completed.' };
    }

    if (booking.status === 'REFUNDED') {
      return { success: false, error: 'This booking is already refunded and cannot be cancelled.' };
    }

    const updated = await db.booking.update({
      where: { id: validated.bookingId },
      data: {
        status: 'CANCELLED',
      },
    });

    safeRevalidatePath('/admin');
    safeRevalidatePath('/admin/bookings');
    safeRevalidatePath(`/admin/bookings/${validated.bookingId}`);
    return { success: true, booking: updated };
  } catch (err: unknown) {
    console.error('Error in cancelBookingAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unable to cancel booking. Please try again.',
    };
  }
}

export async function updateTherapistAction(id: string, input: unknown) {
  try {
    checkServerAdminAuth();
    const therapist = await db.therapist.findUnique({ where: { id } });
    if (!therapist) {
      return { success: false, error: 'Therapist not found.' };
    }

    const validated = therapistBaseSchema.partial().parse(input);

    if (validated.email && validated.email !== therapist.email) {
      const existing = await db.therapist.findUnique({
        where: { email: validated.email },
      });
      if (existing) {
        return { success: false, error: 'Email address is already in use by another therapist.' };
      }
    }

    const updated = await db.therapist.update({
      where: { id },
      data: {
        ...(validated.name !== undefined && { name: validated.name }),
        ...(validated.bio !== undefined && { bio: validated.bio }),
        ...(validated.profileImage !== undefined && { profileImage: validated.profileImage }),
        ...(validated.email !== undefined && { email: validated.email }),
        ...(validated.phone !== undefined && { phone: validated.phone }),
        ...(validated.isActive !== undefined && { isActive: validated.isActive }),
        ...(validated.isFeatured !== undefined && { isFeatured: validated.isFeatured }),
        ...(validated.offersStudio !== undefined && { offersStudio: validated.offersStudio }),
        ...(validated.offersInHome !== undefined && { offersInHome: validated.offersInHome }),
      },
    });

    revalidatePath('/admin/therapists');
    revalidatePath(`/admin/therapists/${id}`);
    return { success: true, therapist: updated };
  } catch (err: unknown) {
    console.error('Error in updateTherapistAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update therapist details.',
    };
  }
}

export async function toggleTherapistActiveAction(id: string, isActive: boolean) {
  return updateTherapistAction(id, { isActive });
}

export async function deleteTherapistAction(id: string) {
  try {
    checkServerAdminAuth();
    const therapist = await db.therapist.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            bookings: true,
            reviews: true,
          },
        },
      },
    });

    if (!therapist) {
      return { success: false, error: 'Therapist not found.' };
    }

    if (therapist._count.bookings > 0 || therapist._count.reviews > 0) {
      return {
        success: false,
        error: `Cannot delete therapist with active records (${therapist._count.bookings} booking(s), ${therapist._count.reviews} review(s)). Consider deactivating instead.`,
      };
    }

    await db.therapist.delete({ where: { id } });
    revalidatePath('/admin/therapists');
    return { success: true };
  } catch (err: unknown) {
    console.error('Error in deleteTherapistAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete therapist.',
    };
  }
}

// --- Photos ---

export async function addTherapistPhotoAction(therapistId: string, input: unknown) {
  try {
    checkServerAdminAuth();
    const therapist = await db.therapist.findUnique({ where: { id: therapistId } });
    if (!therapist) {
      return { success: false, error: 'Therapist not found.' };
    }

    const validated = photoSchema.parse(input);

    const photo = await db.therapistPhoto.create({
      data: {
        therapistId,
        url: validated.url,
        altText: validated.altText || null,
        sortOrder: validated.sortOrder ?? 0,
      },
    });

    revalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true, photo };
  } catch (err: unknown) {
    console.error('Error in addTherapistPhotoAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to add photo.',
    };
  }
}

export async function updateTherapistPhotoOrderAction(therapistId: string, input: unknown) {
  try {
    checkServerAdminAuth();
    const therapist = await db.therapist.findUnique({ where: { id: therapistId } });
    if (!therapist) {
      return { success: false, error: 'Therapist not found.' };
    }

    const validated = photoUpdateSchema.parse(input);

    const existingPhoto = await db.therapistPhoto.findFirst({
      where: { id: validated.photoId, therapistId },
    });

    if (!existingPhoto) {
      return { success: false, error: 'Photo not found for this therapist.' };
    }

    const updated = await db.therapistPhoto.update({
      where: { id: validated.photoId },
      data: {
        sortOrder: validated.sortOrder !== undefined ? validated.sortOrder : existingPhoto.sortOrder,
        altText: validated.altText !== undefined ? (validated.altText || null) : existingPhoto.altText,
        url: validated.url !== undefined ? validated.url : existingPhoto.url,
      },
    });

    revalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true, photo: updated };
  } catch (err: unknown) {
    console.error('Error in updateTherapistPhotoOrderAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update photo order.',
    };
  }
}

export async function removeTherapistPhotoAction(therapistId: string, photoId: string) {
  try {
    checkServerAdminAuth();
    const photo = await db.therapistPhoto.findFirst({
      where: { id: photoId, therapistId },
    });

    if (!photo) {
      return { success: false, error: 'Photo not found for this therapist.' };
    }

    await db.therapistPhoto.delete({ where: { id: photoId } });
    revalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('Error in removeTherapistPhotoAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to remove photo.',
    };
  }
}

// --- Services ---

export async function assignTherapistServiceAction(therapistId: string, input: unknown) {
  try {
    checkServerAdminAuth();
    const therapist = await db.therapist.findUnique({ where: { id: therapistId } });
    if (!therapist) {
      return { success: false, error: 'Therapist not found.' };
    }

    const validated = therapistServiceSchema.parse(input);

    const service = await db.service.findUnique({
      where: { id: validated.serviceId },
    });

    if (!service) {
      return { success: false, error: 'Referenced service not found.' };
    }

    const therapistService = await db.therapistService.upsert({
      where: {
        therapistId_serviceId: {
          therapistId,
          serviceId: validated.serviceId,
        },
      },
      update: {
        customPrice: validated.customPrice ?? null,
        customDurationMinutes: validated.customDurationMinutes ?? null,
        isActive: validated.isActive,
      },
      create: {
        therapistId,
        serviceId: validated.serviceId,
        customPrice: validated.customPrice ?? null,
        customDurationMinutes: validated.customDurationMinutes ?? null,
        isActive: validated.isActive,
      },
      include: {
        service: true,
      },
    });

    revalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true, therapistService };
  } catch (err: unknown) {
    console.error('Error in assignTherapistServiceAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to assign service.',
    };
  }
}

export async function removeTherapistServiceAction(therapistId: string, serviceId: string) {
  try {
    checkServerAdminAuth();
    const therapistService = await db.therapistService.findUnique({
      where: {
        therapistId_serviceId: {
          therapistId,
          serviceId,
        },
      },
    });

    if (!therapistService) {
      return { success: false, error: 'Service assignment not found.' };
    }

    await db.therapistService.delete({
      where: {
        therapistId_serviceId: {
          therapistId,
          serviceId,
        },
      },
    });

    revalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('Error in removeTherapistServiceAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to remove service assignment.',
    };
  }
}

// --- Service Areas ---

export async function addServiceAreaAction(therapistId: string, input: unknown) {
  try {
    checkServerAdminAuth();
    const therapist = await db.therapist.findUnique({ where: { id: therapistId } });
    if (!therapist) {
      return { success: false, error: 'Therapist not found.' };
    }

    const validated = serviceAreaSchema.parse(input);

    const existingArea = await db.serviceArea.findFirst({
      where: {
        therapistId,
        cityName: { equals: validated.cityName },
        state: { equals: validated.state },
        zipCode: { equals: validated.zipCode },
      },
    });

    if (existingArea) {
      return { success: false, error: 'Service coverage area already exists for this therapist.' };
    }

    const serviceArea = await db.serviceArea.create({
      data: {
        therapistId,
        cityName: validated.cityName,
        state: validated.state,
        zipCode: validated.zipCode,
      },
    });

    revalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true, serviceArea };
  } catch (err: unknown) {
    console.error('Error in addServiceAreaAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to add service coverage area.',
    };
  }
}

export async function removeServiceAreaAction(therapistId: string, areaId: string) {
  try {
    checkServerAdminAuth();
    const serviceArea = await db.serviceArea.findFirst({
      where: { id: areaId, therapistId },
    });

    if (!serviceArea) {
      return { success: false, error: 'Service area not found.' };
    }

    await db.serviceArea.delete({ where: { id: areaId } });
    revalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('Error in removeServiceAreaAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to remove service area.',
    };
  }
}

// --- Availability ---

export async function addTherapistAvailabilityAction(therapistId: string, input: unknown) {
  try {
    checkServerAdminAuth();
    const therapist = await db.therapist.findUnique({ where: { id: therapistId } });
    if (!therapist) {
      return { success: false, error: 'Therapist not found.' };
    }

    const validated = availabilitySchema.parse(input);

    const availability = await db.therapistAvailability.create({
      data: {
        therapistId,
        dayOfWeek: validated.dayOfWeek ?? null,
        specificDate: validated.specificDate ? new Date(validated.specificDate) : null,
        startTime: validated.startTime,
        endTime: validated.endTime,
        isUnavailable: validated.isUnavailable,
      },
    });

    revalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true, availability };
  } catch (err: unknown) {
    console.error('Error in addTherapistAvailabilityAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to add availability entry.',
    };
  }
}

export async function updateTherapistAvailabilityAction(therapistId: string, input: unknown) {
  try {
    checkServerAdminAuth();
    const therapist = await db.therapist.findUnique({ where: { id: therapistId } });
    if (!therapist) {
      return { success: false, error: 'Therapist not found.' };
    }

    const validated = availabilityUpdateSchema.parse(input);

    const existingAvailability = await db.therapistAvailability.findFirst({
      where: { id: validated.availabilityId, therapistId },
    });

    if (!existingAvailability) {
      return { success: false, error: 'Availability entry not found for this therapist.' };
    }

    const updated = await db.therapistAvailability.update({
      where: { id: validated.availabilityId },
      data: {
        dayOfWeek: validated.dayOfWeek !== undefined ? validated.dayOfWeek : existingAvailability.dayOfWeek,
        specificDate: validated.specificDate !== undefined
          ? (validated.specificDate ? new Date(validated.specificDate) : null)
          : existingAvailability.specificDate,
        startTime: validated.startTime ?? existingAvailability.startTime,
        endTime: validated.endTime ?? existingAvailability.endTime,
        isUnavailable: validated.isUnavailable !== undefined ? validated.isUnavailable : existingAvailability.isUnavailable,
      },
    });

    revalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true, availability: updated };
  } catch (err: unknown) {
    console.error('Error in updateTherapistAvailabilityAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update availability entry.',
    };
  }
}

export async function removeTherapistAvailabilityAction(therapistId: string, availabilityId: string) {
  try {
    checkServerAdminAuth();
    const availability = await db.therapistAvailability.findFirst({
      where: { id: availabilityId, therapistId },
    });

    if (!availability) {
      return { success: false, error: 'Availability entry not found.' };
    }

    await db.therapistAvailability.delete({ where: { id: availabilityId } });
    revalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('Error in removeTherapistAvailabilityAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to remove availability entry.',
    };
  }
}
