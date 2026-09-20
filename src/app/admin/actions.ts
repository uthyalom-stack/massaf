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
import { updateReviewStatusSchema } from '@/lib/validations/admin-review';
import { createMarketingLinkSchema, updateMarketingLinkSchema } from '@/lib/validations/admin-marketing';
import { BookingStatus, ReviewStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import {
  notifyBookingConfirmed,
  notifyBookingCancelled,
  notifyBookingCompleted,
} from '@/lib/notifications';
import { deleteFromR2 } from '@/lib/r2';

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
        telegramChatId: validated.telegramChatId || null,
        isActive: validated.isActive,
        isFeatured: validated.isFeatured,
        offersStudio: validated.offersStudio,
        offersInHome: validated.offersInHome,
      },
    });

    safeRevalidatePath('/admin/therapists');
    return { success: true, therapist };
  } catch (err: unknown) {
    console.error('Error in createTherapistAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create therapist record.',
    };
  }
}

// --- Marketing Links ---

export async function createMarketingLinkAction(input: unknown) {
  try {
    checkServerAdminAuth();
    const validated = createMarketingLinkSchema.parse(input);

    // Enforce code uniqueness server-side
    const existing = await db.marketingLink.findUnique({
      where: { code: validated.code },
    });

    if (existing) {
      return {
        success: false,
        error: `A marketing link with code '${validated.code}' already exists. Please choose a unique code.`,
      };
    }

    const marketingLink = await db.marketingLink.create({
      data: {
        name: validated.name,
        code: validated.code,
        destinationUrl: validated.destinationUrl || '/',
        isActive: validated.isActive ?? true,
      },
    });

    safeRevalidatePath('/admin');
    safeRevalidatePath('/admin/marketing-links');
    return { success: true, marketingLink };
  } catch (err: unknown) {
    console.error('Error in createMarketingLinkAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create marketing link.',
    };
  }
}

export async function updateMarketingLinkAction(input: unknown) {
  try {
    checkServerAdminAuth();
    const validated = updateMarketingLinkSchema.parse(input);

    const existing = await db.marketingLink.findUnique({
      where: { id: validated.id },
    });

    if (!existing) {
      return { success: false, error: 'Marketing link not found.' };
    }

    if (validated.code && validated.code !== existing.code) {
      const codeConflict = await db.marketingLink.findUnique({
        where: { code: validated.code },
      });
      if (codeConflict) {
        return {
          success: false,
          error: `A marketing link with code '${validated.code}' already exists. Please choose a unique code.`,
        };
      }
    }

    const updated = await db.marketingLink.update({
      where: { id: validated.id },
      data: {
        ...(validated.name !== undefined && { name: validated.name }),
        ...(validated.code !== undefined && { code: validated.code }),
        ...(validated.destinationUrl !== undefined && { destinationUrl: validated.destinationUrl }),
        ...(validated.isActive !== undefined && { isActive: validated.isActive }),
      },
    });

    safeRevalidatePath('/admin');
    safeRevalidatePath('/admin/marketing-links');
    safeRevalidatePath(`/admin/marketing-links/${validated.id}`);
    return { success: true, marketingLink: updated };
  } catch (err: unknown) {
    console.error('Error in updateMarketingLinkAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update marketing link.',
    };
  }
}

export async function toggleMarketingLinkActiveAction(id: string, isActive: boolean) {
  return updateMarketingLinkAction({ id, isActive });
}

// --- Reviews Moderation ---

/**
 * Validates whether a transition between ReviewStatus values is permissible.
 */
function isValidReviewStatusTransition(currentStatus: ReviewStatus, newStatus: ReviewStatus): boolean {
  if (currentStatus === newStatus) return true;
  // All transitions between PENDING, APPROVED, and REJECTED are valid for admin moderation
  return ['PENDING', 'APPROVED', 'REJECTED'].includes(newStatus);
}

export async function updateReviewStatusAction(input: unknown) {
  try {
    checkServerAdminAuth();
    const validated = updateReviewStatusSchema.parse(input);

    const review = await db.review.findUnique({
      where: { id: validated.reviewId },
    });

    if (!review) {
      return { success: false, error: 'Review not found.' };
    }

    if (!isValidReviewStatusTransition(review.status, validated.status)) {
      return {
        success: false,
        error: `This review cannot be moved to status '${validated.status}'.`,
      };
    }

    const isPublished = validated.status === 'APPROVED';

    // Execute review status update and therapist rating aggregate update in a transaction so both succeed or fail together
    const updated = await db.$transaction(async (tx) => {
      const updatedReview = await tx.review.update({
        where: { id: validated.reviewId },
        data: {
          status: validated.status,
          isPublished,
        },
      });

      if (review.therapistId) {
        const approvedReviews = await tx.review.findMany({
          where: {
            therapistId: review.therapistId,
            status: 'APPROVED',
            isPublished: true,
          },
          select: {
            rating: true,
          },
        });

        const count = approvedReviews.length;
        let avgRating = 0;
        if (count > 0) {
          const sum = approvedReviews.reduce((acc, r) => acc + r.rating, 0);
          avgRating = Math.round((sum / count) * 10) / 10;
        }

        await tx.therapist.update({
          where: { id: review.therapistId },
          data: {
            rating: avgRating,
            reviewCount: count,
          },
        });
      }

      return updatedReview;
    });

    safeRevalidatePath('/admin');
    safeRevalidatePath('/admin/reviews');
    safeRevalidatePath(`/admin/reviews/${validated.reviewId}`);
    if (review.therapistId) {
      safeRevalidatePath(`/therapists/${review.therapistId}`);
    }

    return { success: true, review: updated };
  } catch (err: unknown) {
    console.error('Error in updateReviewStatusAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unable to update review status. Please try again.',
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

    // Dispatch lifecycle notifications with failure isolation
    try {
      if (validated.status === 'CONFIRMED' && booking.status !== 'CONFIRMED') {
        await notifyBookingConfirmed(updated.id);
      } else if (validated.status === 'CANCELLED' && booking.status !== 'CANCELLED') {
        await notifyBookingCancelled(updated.id);
      } else if (validated.status === 'COMPLETED' && booking.status !== 'COMPLETED') {
        await notifyBookingCompleted(updated.id);
      }
    } catch (notifErr) {
      console.error('Failed to trigger admin status change notification:', notifErr);
    }

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

    // Check therapist existence & eligibility in database
    const therapist = await db.therapist.findUnique({
      where: { id: validated.therapistId },
      include: {
        services: true,
        serviceAreas: true,
      },
    });

    if (!therapist) {
      return { success: false, error: 'This therapist cannot be assigned to this booking.' };
    }

    if (!therapist.isActive) {
      return { success: false, error: 'This therapist cannot be assigned to this booking.' };
    }

    if (booking.locationType === 'STUDIO' && !therapist.offersStudio) {
      return {
        success: false,
        error: 'This therapist cannot be assigned to this booking.',
      };
    }

    if (booking.locationType === 'IN_HOME' && !therapist.offersInHome) {
      return {
        success: false,
        error: 'This therapist cannot be assigned to this booking.',
      };
    }

    // Check service compatibility strictly against active TherapistService DB records
    const offersService = therapist.services.some(
      (ts) => ts.serviceId === booking.serviceId && ts.isActive
    );

    if (!offersService) {
      return {
        success: false,
        error: 'This therapist cannot be assigned to this booking.',
      };
    }

    // Check service area for IN_HOME bookings if therapist has serviceAreas configured
    if (booking.locationType === 'IN_HOME' && booking.zipCode && therapist.serviceAreas.length > 0) {
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

    // Dispatch cancellation notification with failure isolation
    try {
      await notifyBookingCancelled(updated.id, validated.reason || 'Cancelled by admin');
    } catch (notifErr) {
      console.error('Failed to trigger admin cancellation notification:', notifErr);
    }

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
  let newlyUploadedUrl: string | null = null;

  try {
    checkServerAdminAuth();
    const therapist = await db.therapist.findUnique({ where: { id } });
    if (!therapist) {
      return { success: false, error: 'Therapist not found.' };
    }

    const validated = therapistBaseSchema.partial().parse(input);

    const oldProfileImage = therapist.profileImage;
    if (validated.profileImage && validated.profileImage !== oldProfileImage) {
      newlyUploadedUrl = validated.profileImage;
    }

    if (validated.email && validated.email !== therapist.email) {
      const existing = await db.therapist.findUnique({
        where: { email: validated.email },
      });
      if (existing) {
        if (newlyUploadedUrl) {
          try {
            await deleteFromR2(newlyUploadedUrl);
          } catch (delErr) {
            console.error('Error cleaning up newly uploaded R2 image on email conflict:', delErr);
          }
        }
        return { success: false, error: 'Email address is already in use by another therapist.' };
      }
    }

    // 1. Execute DB update FIRST
    const updated = await db.therapist.update({
      where: { id },
      data: {
        ...(validated.name !== undefined && { name: validated.name }),
        ...(validated.bio !== undefined && { bio: validated.bio }),
        ...(validated.profileImage !== undefined && { profileImage: validated.profileImage || null }),
        ...(validated.email !== undefined && { email: validated.email }),
        ...(validated.phone !== undefined && { phone: validated.phone }),
        ...(validated.telegramChatId !== undefined && { telegramChatId: validated.telegramChatId || null }),
        ...(validated.isActive !== undefined && { isActive: validated.isActive }),
        ...(validated.isFeatured !== undefined && { isFeatured: validated.isFeatured }),
        ...(validated.offersStudio !== undefined && { offersStudio: validated.offersStudio }),
        ...(validated.offersInHome !== undefined && { offersInHome: validated.offersInHome }),
      },
    });

    // 2. Only after DB update succeeds, safely delete old profile image if replaced or cleared
    if (oldProfileImage && oldProfileImage !== updated.profileImage) {
      try {
        await deleteFromR2(oldProfileImage);
      } catch (delErr) {
        console.error('Non-critical error deleting replaced/cleared old profile image from R2:', delErr);
      }
    }

    safeRevalidatePath('/admin/therapists');
    safeRevalidatePath(`/admin/therapists/${id}`);
    return { success: true, therapist: updated };
  } catch (err: unknown) {
    console.error('Error in updateTherapistAction:', err);

    // Rollback cleanup: if DB update failed and a new R2 object was uploaded, delete newly uploaded object
    if (newlyUploadedUrl) {
      try {
        await deleteFromR2(newlyUploadedUrl);
      } catch (rollbackErr) {
        console.error('Failed to clean up newly uploaded R2 object after DB update error:', rollbackErr);
      }
    }

    return {
      success: false,
      error: 'Failed to update therapist details. Please try again.',
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
        photos: true,
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

    // Delete DB record first
    await db.therapist.delete({ where: { id } });

    // Clean up associated R2 media objects (profile image and gallery photos)
    if (therapist.profileImage) {
      await deleteFromR2(therapist.profileImage);
    }

    for (const photo of therapist.photos) {
      await deleteFromR2(photo.url);
    }

    safeRevalidatePath('/admin/therapists');
    return { success: true };
  } catch (err: unknown) {
    console.error('Error in deleteTherapistAction:', err);
    return {
      success: false,
      error: 'Failed to delete therapist record. Please try again.',
    };
  }
}

// --- Photos ---

export async function addTherapistPhotoAction(therapistId: string, input: unknown) {
  let uploadedUrl: string | null = null;

  try {
    checkServerAdminAuth();

    if (typeof input === 'object' && input !== null && 'url' in input && typeof (input as { url: unknown }).url === 'string') {
      uploadedUrl = (input as { url: string }).url;
    }

    const therapist = await db.therapist.findUnique({ where: { id: therapistId } });
    if (!therapist) {
      if (uploadedUrl) {
        try {
          await deleteFromR2(uploadedUrl);
        } catch (cleanupErr) {
          console.error('Error cleaning up orphaned R2 object on therapist not found:', cleanupErr);
        }
      }
      return { success: false, error: 'Therapist not found.' };
    }

    const validated = photoSchema.parse(input);
    uploadedUrl = validated.url;

    // Create DB record
    const photo = await db.therapistPhoto.create({
      data: {
        therapistId,
        url: validated.url,
        altText: validated.altText || null,
        sortOrder: validated.sortOrder ?? 0,
      },
    });

    safeRevalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true, photo };
  } catch (err: unknown) {
    console.error('Error in addTherapistPhotoAction:', err);

    // If DB insertion fails, delete newly uploaded R2 object to prevent orphaned storage
    if (uploadedUrl) {
      try {
        await deleteFromR2(uploadedUrl);
      } catch (cleanupErr) {
        console.error('Error cleaning up orphaned R2 object on gallery insert failure:', cleanupErr);
      }
    }

    return {
      success: false,
      error: 'Failed to save gallery photo record. Please try again.',
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

    safeRevalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true, photo: updated };
  } catch (err: unknown) {
    console.error('Error in updateTherapistPhotoOrderAction:', err);
    return {
      success: false,
      error: 'Failed to update photo order.',
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

    // 1. Delete DB record FIRST
    await db.therapistPhoto.delete({ where: { id: photoId } });

    // 2. Only if DB deletion succeeds, delete corresponding R2 object if it matches MASSAF R2 domain
    if (photo.url) {
      try {
        await deleteFromR2(photo.url);
      } catch (delErr) {
        console.error('Non-critical error deleting photo object from R2:', delErr);
      }
    }

    safeRevalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('Error in removeTherapistPhotoAction:', err);
    return {
      success: false,
      error: 'Failed to remove gallery photo. Please try again.',
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

    safeRevalidatePath(`/admin/therapists/${therapistId}`);
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

    safeRevalidatePath(`/admin/therapists/${therapistId}`);
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

    safeRevalidatePath(`/admin/therapists/${therapistId}`);
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
    safeRevalidatePath(`/admin/therapists/${therapistId}`);
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

    safeRevalidatePath(`/admin/therapists/${therapistId}`);
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

    safeRevalidatePath(`/admin/therapists/${therapistId}`);
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
    safeRevalidatePath(`/admin/therapists/${therapistId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('Error in removeTherapistAvailabilityAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to remove availability entry.',
    };
  }
}
