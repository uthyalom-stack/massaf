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
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { parseTimeStringToMinutes } from '@/lib/availability';

/**
 * Server-side authorization check ensuring caller holds a valid, verified admin session.
 */
async function checkServerAdminAuth() {
  const adminSession = await getVerifiedAdminSession();
  if (!adminSession) {
    throw new Error('Unauthorized: You must be logged in as an administrator to perform this action.');
  }
  return adminSession;
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
    await checkServerAdminAuth();
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

// --- Service Categories & Global Services ---

export async function createServiceCategoryAction(input: unknown) {
  try {
    await checkServerAdminAuth();
    const data = input as { name: string; description?: string; imageUrl?: string; sortOrder?: number; isActive?: boolean };
    if (!data.name || data.name.trim().length < 2) {
      return { success: false, error: 'Category name must be at least 2 characters.' };
    }

    const category = await db.serviceCategory.create({
      data: {
        name: data.name.trim(),
        description: data.description || null,
        imageUrl: data.imageUrl || null,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });

    safeRevalidatePath('/admin/categories');
    safeRevalidatePath('/services');
    return { success: true, category };
  } catch (err: unknown) {
    console.error('Error in createServiceCategoryAction:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create service category.' };
  }
}

export async function updateServiceCategoryAction(id: string, input: unknown) {
  try {
    await checkServerAdminAuth();
    const data = input as { name?: string; description?: string; imageUrl?: string; sortOrder?: number; isActive?: boolean };
    const updated = await db.serviceCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.description !== undefined && { description: data.description || null }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl || null }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    safeRevalidatePath('/admin/categories');
    safeRevalidatePath('/services');
    return { success: true, category: updated };
  } catch (err: unknown) {
    console.error('Error in updateServiceCategoryAction:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update service category.' };
  }
}

export async function deleteServiceCategoryAction(id: string) {
  try {
    await checkServerAdminAuth();
    // Unassign category from services before deleting category
    await db.service.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    });

    await db.serviceCategory.delete({ where: { id } });

    safeRevalidatePath('/admin/categories');
    safeRevalidatePath('/services');
    return { success: true };
  } catch (err: unknown) {
    console.error('Error in deleteServiceCategoryAction:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete service category.' };
  }
}

export async function createGlobalServiceAction(input: unknown) {
  try {
    await checkServerAdminAuth();
    const data = input as {
      name: string;
      description?: string;
      durationMinutes: number;
      price: number;
      categoryId?: string;
      isActive?: boolean;
    };

    if (!data.name || data.name.trim().length < 2) {
      return { success: false, error: 'Service name must be at least 2 characters.' };
    }

    const service = await db.service.create({
      data: {
        name: data.name.trim(),
        description: data.description || null,
        durationMinutes: Number(data.durationMinutes),
        price: Number(data.price),
        categoryId: data.categoryId || null,
        isActive: data.isActive ?? true,
      },
    });

    safeRevalidatePath('/admin/services');
    safeRevalidatePath('/services');
    return { success: true, service };
  } catch (err: unknown) {
    console.error('Error in createGlobalServiceAction:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create global service.' };
  }
}

export async function updateGlobalServiceAction(id: string, input: unknown) {
  try {
    await checkServerAdminAuth();
    const data = input as {
      name?: string;
      description?: string;
      durationMinutes?: number;
      price?: number;
      categoryId?: string;
      isActive?: boolean;
    };

    const updated = await db.service.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.description !== undefined && { description: data.description || null }),
        ...(data.durationMinutes !== undefined && { durationMinutes: Number(data.durationMinutes) }),
        ...(data.price !== undefined && { price: Number(data.price) }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    safeRevalidatePath('/admin/services');
    safeRevalidatePath('/services');
    return { success: true, service: updated };
  } catch (err: unknown) {
    console.error('Error in updateGlobalServiceAction:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update global service.' };
  }
}

// --- Testimonials (Admin Promotional Reviews) ---

export async function createTestimonialAction(input: unknown) {
  try {
    await checkServerAdminAuth();
    const data = input as {
      authorName: string;
      authorLocation?: string;
      rating: number;
      comment: string;
      therapistId: string;
      isPublished?: boolean;
    };

    if (!data.authorName || !data.comment || !data.therapistId) {
      return { success: false, error: 'Author name, comment, and therapist selection are required.' };
    }

    const testimonial = await db.testimonial.create({
      data: {
        authorName: data.authorName.trim(),
        authorLocation: data.authorLocation ? data.authorLocation.trim() : null,
        rating: Math.min(5, Math.max(1, Number(data.rating))),
        comment: data.comment.trim(),
        therapistId: data.therapistId,
        isPublished: data.isPublished ?? true,
      },
    });

    safeRevalidatePath('/admin/reviews');
    if (data.therapistId) safeRevalidatePath(`/therapists/${data.therapistId}`);
    return { success: true, testimonial };
  } catch (err: unknown) {
    console.error('Error in createTestimonialAction:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create testimonial.' };
  }
}

export async function toggleTestimonialPublishedAction(id: string, isPublished: boolean) {
  try {
    await checkServerAdminAuth();
    const updated = await db.testimonial.update({
      where: { id },
      data: { isPublished },
    });

    safeRevalidatePath('/admin/reviews');
    if (updated.therapistId) safeRevalidatePath(`/therapists/${updated.therapistId}`);
    return { success: true, testimonial: updated };
  } catch (err: unknown) {
    console.error('Error in toggleTestimonialPublishedAction:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update testimonial.' };
  }
}

export async function deleteTestimonialAction(id: string) {
  try {
    await checkServerAdminAuth();
    const testimonial = await db.testimonial.findUnique({ where: { id } });
    if (!testimonial) return { success: false, error: 'Testimonial not found.' };

    await db.testimonial.delete({ where: { id } });

    safeRevalidatePath('/admin/reviews');
    if (testimonial.therapistId) safeRevalidatePath(`/therapists/${testimonial.therapistId}`);
    return { success: true };
  } catch (err: unknown) {
    console.error('Error in deleteTestimonialAction:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete testimonial.' };
  }
}

// --- Site Content CMS ---

export async function updateSiteContentAction(key: string, title: string, content: string) {
  try {
    await checkServerAdminAuth();
    if (!key || !title || !content) {
      return { success: false, error: 'Key, title, and content are required.' };
    }

    const updated = await db.siteContent.upsert({
      where: { key },
      update: { title, content },
      create: { key, title, content },
    });

    safeRevalidatePath(`/${key}`);
    safeRevalidatePath('/admin/content');
    return { success: true, content: updated };
  } catch (err: unknown) {
    console.error('Error in updateSiteContentAction:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update site content.' };
  }
}

// --- Marketing Links ---

export async function createMarketingLinkAction(input: unknown) {
  try {
    await checkServerAdminAuth();
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
    await checkServerAdminAuth();
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
    await checkServerAdminAuth();
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
    await checkServerAdminAuth();
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
    await checkServerAdminAuth();
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
    await checkServerAdminAuth();
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
    await checkServerAdminAuth();
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
    await checkServerAdminAuth();
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
    await checkServerAdminAuth();

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
    await checkServerAdminAuth();
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
    await checkServerAdminAuth();
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
    await checkServerAdminAuth();
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
    await checkServerAdminAuth();
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
    await checkServerAdminAuth();
    const therapist = await db.therapist.findUnique({ where: { id: therapistId } });
    if (!therapist) {
      return { success: false, error: 'Therapist not found.' };
    }

    const validated = serviceAreaSchema.parse(input);

    // Support bulk ZIP codes separated by commas, spaces, or newlines
    const rawZips = validated.zipCode.split(/[\s,;\n\r]+/).map((z) => z.trim()).filter((z) => z.length >= 3);

    if (rawZips.length === 0) {
      return { success: false, error: 'Please provide at least one valid ZIP code.' };
    }

    const createdAreas = [];
    let duplicateCount = 0;

    for (const zip of rawZips) {
      const existingArea = await db.serviceArea.findFirst({
        where: {
          therapistId,
          cityName: { equals: validated.cityName },
          state: { equals: validated.state },
          zipCode: { equals: zip },
        },
      });

      if (existingArea) {
        duplicateCount++;
        continue;
      }

      const serviceArea = await db.serviceArea.create({
        data: {
          therapistId,
          cityName: validated.cityName,
          state: validated.state,
          zipCode: zip,
        },
      });
      createdAreas.push(serviceArea);
    }

    if (createdAreas.length === 0) {
      return {
        success: false,
        error: duplicateCount > 0
          ? 'All specified ZIP codes already exist in coverage for this therapist.'
          : 'Failed to add service coverage areas.',
      };
    }

    safeRevalidatePath(`/admin/therapists/${therapistId}`);
    return {
      success: true,
      serviceArea: createdAreas[0],
      serviceAreas: createdAreas,
      count: createdAreas.length,
    };
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
    await checkServerAdminAuth();
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

function expandDayRange(startDay: number, endDay: number): number[] {
  const days: number[] = [];
  if (startDay <= endDay) {
    for (let d = startDay; d <= endDay; d++) {
      days.push(d);
    }
  } else {
    for (let d = startDay; d <= 6; d++) {
      days.push(d);
    }
    for (let d = 0; d <= endDay; d++) {
      days.push(d);
    }
  }
  return days;
}

export async function addTherapistAvailabilityAction(therapistId: string, input: unknown) {
  try {
    await checkServerAdminAuth();
    const therapist = await db.therapist.findUnique({ where: { id: therapistId } });
    if (!therapist) {
      return { success: false, error: 'Therapist not found.' };
    }

    const validated = availabilitySchema.parse(input);

    const startMins = parseTimeStringToMinutes(validated.startTime);
    const endMins = parseTimeStringToMinutes(validated.endTime);
    if (startMins >= endMins) {
      return { success: false, error: 'Start time must be strictly before end time.' };
    }

    // Determine target days (single day or day range expansion)
    let targetDays: Array<number | null> = [];

    if (
      validated.startDayOfWeek !== undefined &&
      validated.startDayOfWeek !== null &&
      validated.endDayOfWeek !== undefined &&
      validated.endDayOfWeek !== null
    ) {
      targetDays = expandDayRange(validated.startDayOfWeek, validated.endDayOfWeek);
    } else if (validated.dayOfWeek !== undefined && validated.dayOfWeek !== null) {
      targetDays = [validated.dayOfWeek];
    } else {
      targetDays = [null];
    }

    const specDate = validated.specificDate ? new Date(validated.specificDate) : null;
    const createdAvailabilities = [];
    let overlapCount = 0;

    for (const day of targetDays) {
      if (day !== null && (day < 0 || day > 6)) {
        continue;
      }

      const existing = await db.therapistAvailability.findMany({
        where: {
          therapistId,
          dayOfWeek: day,
          specificDate: specDate,
        },
      });

      const hasOverlap = existing.some((e) => {
        const eStart = parseTimeStringToMinutes(e.startTime);
        const eEnd = parseTimeStringToMinutes(e.endTime);
        return startMins < eEnd && endMins > eStart;
      });

      if (hasOverlap) {
        overlapCount++;
        continue;
      }

      const availability = await db.therapistAvailability.create({
        data: {
          therapistId,
          dayOfWeek: day,
          specificDate: specDate,
          startTime: validated.startTime,
          endTime: validated.endTime,
          isUnavailable: validated.isUnavailable,
        },
      });
      createdAvailabilities.push(availability);
    }

    if (createdAvailabilities.length === 0) {
      return {
        success: false,
        error: overlapCount > 0
          ? 'Selected working hours overlap with existing schedule rules.'
          : 'Failed to add availability schedule rule.',
      };
    }

    safeRevalidatePath(`/admin/therapists/${therapistId}`);
    return {
      success: true,
      availability: createdAvailabilities[0],
      availabilities: createdAvailabilities,
      count: createdAvailabilities.length,
    };
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
    await checkServerAdminAuth();
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

    const targetDayOfWeek = validated.dayOfWeek !== undefined ? validated.dayOfWeek : existingAvailability.dayOfWeek;
    const targetSpecDate = validated.specificDate !== undefined
      ? (validated.specificDate ? new Date(validated.specificDate) : null)
      : existingAvailability.specificDate;
    const targetStartTime = validated.startTime ?? existingAvailability.startTime;
    const targetEndTime = validated.endTime ?? existingAvailability.endTime;

    const startMins = parseTimeStringToMinutes(targetStartTime);
    const endMins = parseTimeStringToMinutes(targetEndTime);
    if (startMins >= endMins) {
      return { success: false, error: 'Start time must be strictly before end time.' };
    }

    if (targetDayOfWeek !== undefined && targetDayOfWeek !== null) {
      if (targetDayOfWeek < 0 || targetDayOfWeek > 6) {
        return { success: false, error: 'Invalid day of week (must be between 0 and 6).' };
      }
    }

    const existing = await db.therapistAvailability.findMany({
      where: {
        therapistId,
        id: { not: validated.availabilityId },
        dayOfWeek: targetDayOfWeek,
        specificDate: targetSpecDate,
      },
    });

    const hasOverlap = existing.some((e) => {
      const eStart = parseTimeStringToMinutes(e.startTime);
      const eEnd = parseTimeStringToMinutes(e.endTime);
      return startMins < eEnd && endMins > eStart;
    });

    if (hasOverlap) {
      return { success: false, error: 'This time range overlaps with an existing availability entry.' };
    }

    const updated = await db.therapistAvailability.update({
      where: { id: validated.availabilityId },
      data: {
        dayOfWeek: targetDayOfWeek,
        specificDate: targetSpecDate,
        startTime: targetStartTime,
        endTime: targetEndTime,
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
    await checkServerAdminAuth();
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
