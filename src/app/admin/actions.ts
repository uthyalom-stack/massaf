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
import { hashPassword } from '@/lib/auth-password';
import { generateLoginId, generateSecurePassword, generateReferralCode } from '@/lib/marketer-utils';

/**
 * Server-side authorization check ensuring caller holds a valid, verified admin session
 * and optionally belongs to one of the specified allowed roles.
 */
async function checkServerAdminAuth(allowedRoles?: string[]) {
  const adminSession = await getVerifiedAdminSession();
  if (!adminSession) {
    throw new Error('Unauthorized: You must be logged in as an administrator to perform this action.');
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = adminSession.role || 'ADMIN';
    if (!allowedRoles.includes(userRole)) {
      throw new Error(`Unauthorized: Role '${userRole}' is not permitted to perform this operation.`);
    }
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

// --- Therapist Management ---

export async function createTherapistAction(input: unknown) {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
        hourlyRate: validated.hourlyRate,
        isActive: validated.isActive,
        isFeatured: validated.isFeatured,
        isHomepageSelected: validated.isHomepageSelected,
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

/**
 * Fisher-Yates array shuffling helper for unbiased randomization.
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Admin action to shuffle all active therapists and distribute them as evenly as possible
 * across state/ZIP ranges in the USZipCode dataset pool without row bloat or resetting customer rotation history.
 */
export async function shuffleAndDistributeTherapistsAction() {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);

    // 1. Fetch all active therapists
    const activeTherapists = await db.therapist.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    if (activeTherapists.length === 0) {
      return {
        success: false,
        error: 'No active therapists found in database. Activate at least one therapist before distributing coverage.',
      };
    }

    // 2. Fetch all real USZipCode records ordered by state and zipCode
    const allZipRecords = await db.uSZipCode.findMany({
      select: { state: true, zipCode: true },
      orderBy: [{ state: 'asc' }, { zipCode: 'asc' }],
    });

    if (allZipRecords.length === 0) {
      return {
        success: false,
        error: 'USZipCode database dataset is empty. Run seed script before distributing coverage.',
      };
    }

    // Group real ZIP codes by state
    const zipsByState = new Map<string, string[]>();
    for (const z of allZipRecords) {
      if (!z.state || !z.zipCode) continue;
      const st = z.state.toUpperCase();
      if (!zipsByState.has(st)) {
        zipsByState.set(st, []);
      }
      zipsByState.get(st)!.push(z.zipCode.trim());
    }

    // Group real ZIP codes into compact geographic 3-digit SCF regions (~1,000 nationwide regions)
    // to dramatically reduce database row bloat while maintaining exact ZIP geographic grouping.
    const scfMap = new Map<string, { state: string; zipCodes: string[] }>();

    for (const z of allZipRecords) {
      if (!z.state || !z.zipCode) continue;
      const cleanZip = z.zipCode.trim().padStart(5, '0');
      const scfPrefix = cleanZip.substring(0, 3);
      const st = z.state.toUpperCase();
      const key = `${st}_${scfPrefix}`;

      if (!scfMap.has(key)) {
        scfMap.set(key, { state: st, zipCodes: [] });
      }
      scfMap.get(key)!.zipCodes.push(cleanZip);
    }

    const allClusters: Array<{ state: string; startZip: string; endZip: string }> = [];

    for (const [, region] of scfMap.entries()) {
      region.zipCodes.sort((a, b) => a.localeCompare(b));

      let chunk: string[] = [];
      for (const zip of region.zipCodes) {
        if (chunk.length === 0) {
          chunk.push(zip);
        } else {
          const firstNum = parseInt(chunk[0], 10);
          const currNum = parseInt(zip, 10);
          // Keep range blocks compact: max numeric span 100 and max 50 real ZIPs per range
          if (!isNaN(firstNum) && !isNaN(currNum) && currNum - firstNum <= 100 && chunk.length < 50) {
            chunk.push(zip);
          } else {
            allClusters.push({
              state: region.state,
              startZip: chunk[0],
              endZip: chunk[chunk.length - 1],
            });
            chunk = [zip];
          }
        }
      }
      if (chunk.length > 0) {
        allClusters.push({
          state: region.state,
          startZip: chunk[0],
          endZip: chunk[chunk.length - 1],
        });
      }
    }

    if (allClusters.length === 0) {
      return {
        success: false,
        error: 'No valid ZIP clusters could be generated from USZipCode dataset.',
      };
    }

    // 3. Randomize order of active therapists to avoid static priority biases
    const shuffledTherapists = shuffleArray(activeTherapists);
    const totalTherapists = shuffledTherapists.length;

    // Determine how many therapists to assign per cluster
    const therapistsPerCluster = totalTherapists <= 3
      ? totalTherapists
      : Math.min(totalTherapists, Math.max(3, Math.floor(totalTherapists / 2)));

    const eligibilityData: Array<{
      therapistId: string;
      state: string;
      startZip: string;
      endZip: string;
    }> = [];

    for (let cIdx = 0; cIdx < allClusters.length; cIdx++) {
      const cluster = allClusters[cIdx];
      for (let k = 0; k < therapistsPerCluster; k++) {
        const therapist = shuffledTherapists[(cIdx + k) % totalTherapists];
        eligibilityData.push({
          therapistId: therapist.id,
          state: cluster.state,
          startZip: cluster.startZip,
          endZip: cluster.endZip,
        });
      }
    }

    // 4. Staged batch write & swap strategy to handle large distributions (up to 200+ therapists) without transaction timeout
    const distributionStartTime = new Date();

    try {
      const BATCH_SIZE = 10000;
      for (let i = 0; i < eligibilityData.length; i += BATCH_SIZE) {
        const batch = eligibilityData.slice(i, i + BATCH_SIZE);
        await db.therapistZipEligibility.createMany({
          data: batch,
        });
      }

      // Safely delete previous distribution records created prior to this shuffle run
      await db.therapistZipEligibility.deleteMany({
        where: {
          createdAt: { lt: distributionStartTime },
        },
      });
    } catch (writeErr) {
      // Clean up partial inserts if write fails, leaving previous distribution intact
      console.error('Error writing distribution batches, rolling back partial inserts:', writeErr);
      await db.therapistZipEligibility.deleteMany({
        where: {
          createdAt: { gte: distributionStartTime },
        },
      });
      throw writeErr;
    }

    safeRevalidatePath('/admin/therapists');
    safeRevalidatePath('/admin/settings');
    safeRevalidatePath('/find-a-therapist');

    return {
      success: true,
      therapistCount: activeTherapists.length,
      distributionRecords: eligibilityData.length,
      message: `Successfully shuffled ${activeTherapists.length} active therapists across ${zipsByState.size} U.S. states (${allClusters.length} geographic clusters, ${eligibilityData.length} eligibility rules created).`,
    };
  } catch (err: unknown) {
    console.error('Error in shuffleAndDistributeTherapistsAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to shuffle and distribute therapists.',
    };
  }
}

export async function approveGiftCardPaymentAction(bookingId: string) {
  try {
    const adminSession = await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: { giftCardSubmission: true },
    });

    if (!booking) {
      return { success: false, error: 'Booking not found.' };
    }

    if (!booking.giftCardSubmission) {
      return { success: false, error: 'No gift card submission found for this booking.' };
    }

    if (booking.paymentStatus === 'PAID' && booking.giftCardSubmission.status === 'APPROVED') {
      return { success: true, message: 'Gift card payment is already approved (idempotent).' };
    }

    await db.giftCardSubmission.update({
      where: { bookingId: booking.id },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedBy: adminSession.email,
      },
    });

    const updatedBooking = await db.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: 'PAID',
        paymentMethod: 'GIFT_CARD',
        status: booking.status === 'PENDING' ? 'CONFIRMED' : booking.status,
      },
    });

    try {
      const { notifyBookingConfirmed } = await import('@/lib/notifications');
      await notifyBookingConfirmed(updatedBooking.id);
    } catch (notifErr) {
      console.error('Error dispatching gift card confirmation notification:', notifErr);
    }

    safeRevalidatePath(`/admin/bookings/${bookingId}`);
    safeRevalidatePath('/admin/bookings');
    return { success: true, message: 'Gift card payment approved and booking confirmed.' };
  } catch (err: unknown) {
    console.error('Error approving gift card payment:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to approve gift card payment.' };
  }
}

export async function rejectGiftCardPaymentAction(bookingId: string, reason?: string) {
  try {
    const adminSession = await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: { giftCardSubmission: true },
    });

    if (!booking) {
      return { success: false, error: 'Booking not found.' };
    }

    if (!booking.giftCardSubmission) {
      return { success: false, error: 'No gift card submission found for this booking.' };
    }

    await db.giftCardSubmission.update({
      where: { bookingId: booking.id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason ? reason.trim() : 'Gift card could not be verified.',
        reviewedAt: new Date(),
        reviewedBy: adminSession.email,
      },
    });

    await db.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: 'FAILED',
        paymentMethod: 'GIFT_CARD',
      },
    });

    safeRevalidatePath(`/admin/bookings/${bookingId}`);
    safeRevalidatePath('/admin/bookings');
    return { success: true, message: 'Gift card payment rejected.' };
  } catch (err: unknown) {
    console.error('Error rejecting gift card payment:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to reject gift card payment.' };
  }
}

export async function toggleHomepageSelectionAction(therapistId: string, isHomepageSelected: boolean) {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
    const therapist = await db.therapist.findUnique({ where: { id: therapistId } });
    if (!therapist) {
      return { success: false, error: 'Therapist not found.' };
    }
    if (isHomepageSelected && !therapist.isActive) {
      return { success: false, error: 'Only active therapists can be selected for homepage display.' };
    }

    const updated = await db.therapist.update({
      where: { id: therapistId },
      data: { isHomepageSelected },
    });

    safeRevalidatePath('/');
    safeRevalidatePath('/admin/therapists');
    safeRevalidatePath('/admin/homepage');
    return { success: true, therapist: updated };
  } catch (err: unknown) {
    console.error('Error in toggleHomepageSelectionAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update homepage selection.',
    };
  }
}

// --- Marketer Account Management (SUPER_ADMIN) ---

export async function createMarketerAction(input: { name: string }) {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN']);

    if (!input || !input.name || typeof input.name !== 'string' || input.name.trim().length < 2) {
      return { success: false, error: 'Marketer name must be at least 2 characters long.' };
    }

    const rawName = input.name.trim();

    // 1. Automatically derive unique login ID (e.g., john.doe@massaf.com)
    const loginId = await generateLoginId(rawName);

    // 2. Automatically generate cryptographically secure password
    const generatedPassword = generateSecurePassword(12);

    // 3. Automatically derive unique referral code (e.g., JOHNDOE)
    const referralCode = await generateReferralCode(rawName);

    // 4. Hash password with Node scrypt algorithm
    const passwordHash = hashPassword(generatedPassword);

    // 5. Atomically create User record and primary MarketingLink in a database transaction
    const { user, link } = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: rawName,
          email: loginId,
          passwordHash,
          role: 'STAFF',
          isActive: true,
        },
      });

      const newLink = await tx.marketingLink.create({
        data: {
          userId: newUser.id,
          name: `${rawName}'s Referral Link`,
          code: referralCode,
          destinationUrl: '/',
          isActive: true,
        },
      });

      return { user: newUser, link: newLink };
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const referralUrl = baseUrl ? `${baseUrl}/?ref=${link.code}` : `/?ref=${link.code}`;

    safeRevalidatePath('/admin');
    safeRevalidatePath('/admin/marketers');
    safeRevalidatePath('/admin/marketing-links');

    return {
      success: true,
      credentials: {
        id: user.id,
        name: user.name,
        loginId: user.email,
        password: generatedPassword,
        referralCode: link.code,
        referralUrl,
      },
    };
  } catch (err: unknown) {
    console.error('Error in createMarketerAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create marketer account.',
    };
  }
}

export async function toggleMarketerActiveAction(userId: string, isActive: boolean) {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN']);

    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== 'STAFF') {
      return { success: false, error: 'Marketer account not found.' };
    }

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { isActive },
      });

      await tx.marketingLink.updateMany({
        where: { userId },
        data: { isActive },
      });
    });

    safeRevalidatePath('/admin');
    safeRevalidatePath('/admin/marketers');
    safeRevalidatePath('/admin/marketing-links');

    return { success: true };
  } catch (err: unknown) {
    console.error('Error in toggleMarketerActiveAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update marketer active status.',
    };
  }
}

export async function regenerateMarketerPasswordAction(userId: string) {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN']);

    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== 'STAFF') {
      return { success: false, error: 'Marketer account not found.' };
    }

    const newPassword = generateSecurePassword(12);
    const newPasswordHash = hashPassword(newPassword);

    await db.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    safeRevalidatePath('/admin');
    safeRevalidatePath('/admin/marketers');

    return {
      success: true,
      credentials: {
        name: user.name || user.email,
        loginId: user.email,
        newPassword,
      },
    };
  } catch (err: unknown) {
    console.error('Error in regenerateMarketerPasswordAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to regenerate marketer password.',
    };
  }
}

export async function listMarketersAction() {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);

    const marketers = await db.user.findMany({
      where: { role: 'STAFF' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        marketingLinks: {
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
            clicks: true,
            bookings: {
              select: {
                id: true,
                amount: true,
                paymentStatus: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedMarketers = marketers.map((m) => {
      let clicks = 0;
      let totalBookings = 0;
      let paidBookings = 0;
      let paidRevenue = 0.0;

      for (const link of m.marketingLinks) {
        clicks += link.clicks;
        totalBookings += link.bookings.length;
        for (const b of link.bookings) {
          if (b.paymentStatus === 'PAID') {
            paidBookings++;
            paidRevenue += b.amount;
          }
        }
      }

      return {
        id: m.id,
        name: m.name || m.email,
        email: m.email,
        role: m.role,
        isActive: m.isActive,
        createdAt: m.createdAt,
        marketingLinks: m.marketingLinks.map((l) => ({
          id: l.id,
          name: l.name,
          code: l.code,
          isActive: l.isActive,
          clicks: l.clicks,
        })),
        clicks,
        totalBookings,
        paidBookings,
        paidRevenue: Math.round(paidRevenue * 100) / 100,
      };
    });

    return { success: true, marketers: formattedMarketers };
  } catch (err: unknown) {
    console.error('Error in listMarketersAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to retrieve marketers list.',
    };
  }
}

export async function deleteMarketerAction(userId: string) {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN']);

    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return { success: false, error: 'Marketer account not found.' };
    }

    if (user.role !== 'STAFF') {
      return { success: false, error: 'Only STAFF (marketer) accounts can be deleted with this action.' };
    }

    // 1. Deactivate all referral links owned by this marketer
    await db.marketingLink.updateMany({
      where: { userId },
      data: { isActive: false },
    });

    // 2. Delete the user record (MarketingLink.userId will become null due to onDelete: SetNull)
    await db.user.delete({
      where: { id: userId },
    });

    safeRevalidatePath('/admin');
    safeRevalidatePath('/admin/marketers');
    return { success: true };
  } catch (err: unknown) {
    console.error('Error in deleteMarketerAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete marketer account.',
    };
  }
}

// --- Service Categories & Global Services ---

export async function createServiceCategoryAction(input: unknown) {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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

    const duration = Number(data.durationMinutes);
    if (isNaN(duration) || duration <= 0) {
      return { success: false, error: 'Duration must be a positive number of minutes.' };
    }

    const price = Number(data.price);
    if (isNaN(price) || price <= 0) {
      return { success: false, error: 'Price must be a positive amount.' };
    }

    // Check for duplicate service name
    const existing = await db.service.findFirst({
      where: { name: { equals: data.name.trim() } },
    });
    if (existing) {
      return { success: false, error: `A service with the name "${data.name.trim()}" already exists.` };
    }

    const service = await db.service.create({
      data: {
        name: data.name.trim(),
        description: data.description || null,
        durationMinutes: duration,
        price: price,
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
    const data = input as {
      name?: string;
      description?: string;
      durationMinutes?: number;
      price?: number;
      categoryId?: string;
      isActive?: boolean;
    };

    if (data.name !== undefined) {
      if (data.name.trim().length < 2) {
        return { success: false, error: 'Service name must be at least 2 characters.' };
      }
      const existing = await db.service.findFirst({
        where: {
          name: { equals: data.name.trim() },
          NOT: { id },
        },
      });
      if (existing) {
        return { success: false, error: `Another service with the name "${data.name.trim()}" already exists.` };
      }
    }

    if (data.durationMinutes !== undefined) {
      const duration = Number(data.durationMinutes);
      if (isNaN(duration) || duration <= 0) {
        return { success: false, error: 'Duration must be a positive number of minutes.' };
      }
    }

    if (data.price !== undefined) {
      const price = Number(data.price);
      if (isNaN(price) || price <= 0) {
        return { success: false, error: 'Price must be a positive amount.' };
      }
    }

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

export async function deleteGlobalServiceAction(id: string) {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);

    const bookingCount = await db.booking.count({
      where: { serviceId: id },
    });

    if (bookingCount > 0) {
      // Safely deactivate instead of hard delete to preserve historical booking records
      await db.service.update({
        where: { id },
        data: { isActive: false },
      });
      safeRevalidatePath('/admin/services');
      safeRevalidatePath('/services');
      return {
        success: true,
        deactivated: true,
        message: 'Service has existing bookings; it has been deactivated instead of deleted.',
      };
    }

    // Delete associated therapist service mappings first if any
    await db.therapistService.deleteMany({
      where: { serviceId: id },
    });

    await db.service.delete({
      where: { id },
    });

    safeRevalidatePath('/admin/services');
    safeRevalidatePath('/services');
    return { success: true };
  } catch (err: unknown) {
    console.error('Error in deleteGlobalServiceAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete service.',
    };
  }
}

// --- Testimonials (Admin Promotional Reviews) ---

export async function createTestimonialAction(input: unknown) {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    const session = await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN', 'STAFF']);
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

    let targetUserId: string | null = null;
    if (session.role === 'STAFF') {
      targetUserId = session.entityId;
    } else if (validated.userId) {
      targetUserId = validated.userId;
    }

    const marketingLink = await db.marketingLink.create({
      data: {
        name: validated.name,
        code: validated.code,
        destinationUrl: validated.destinationUrl || '/',
        isActive: validated.isActive ?? true,
        userId: targetUserId,
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
    const session = await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN', 'STAFF']);
    const validated = updateMarketingLinkSchema.parse(input);

    const existing = await db.marketingLink.findUnique({
      where: { id: validated.id },
    });

    if (!existing) {
      return { success: false, error: 'Marketing link not found.' };
    }

    if (session.role === 'STAFF' && existing.userId !== session.entityId) {
      return {
        success: false,
        error: 'Unauthorized: You can only modify your own marketing links.',
      };
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
        ...(session.role !== 'STAFF' && validated.userId !== undefined && { userId: validated.userId }),
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

export async function getMarketerStatsAction(userId?: string) {
  try {
    const session = await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN', 'STAFF']);
    const targetUserId = session.role === 'STAFF' ? session.entityId : (userId || session.entityId);

    const links = await db.marketingLink.findMany({
      where: { userId: targetUserId },
      select: {
        id: true,
        clicks: true,
      },
    });

    const linkIds = links.map((l) => l.id);
    const totalClicks = links.reduce((sum, l) => sum + l.clicks, 0);

    let totalBookings = 0;
    let paidBookings = 0;
    let paidRevenue = 0.0;

    if (linkIds.length > 0) {
      const bookings = await db.booking.findMany({
        where: {
          marketingLinkId: { in: linkIds },
        },
        select: {
          id: true,
          amount: true,
          paymentStatus: true,
        },
      });

      totalBookings = bookings.length;

      const paidList = bookings.filter((b) => b.paymentStatus === 'PAID');
      paidBookings = paidList.length;
      paidRevenue = paidList.reduce((sum, b) => sum + b.amount, 0);
    }

    return {
      success: true,
      stats: {
        clicks: totalClicks,
        totalBookings,
        paidBookings,
        paidRevenue: Math.round(paidRevenue * 100) / 100,
      },
    };
  } catch (err: unknown) {
    console.error('Error in getMarketerStatsAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to retrieve marketer stats.',
    };
  }
}

export async function getMarketerLeaderboardAction() {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN', 'STAFF']);

    const marketers = await db.user.findMany({
      where: { role: 'STAFF' },
      select: {
        id: true,
        name: true,
        email: true,
        marketingLinks: {
          select: {
            id: true,
            clicks: true,
            bookings: {
              select: {
                amount: true,
                paymentStatus: true,
              },
            },
          },
        },
      },
    });

    const leaderboard = marketers.map((m) => {
      let clicks = 0;
      let totalBookings = 0;
      let paidRevenue = 0.0;

      for (const link of m.marketingLinks) {
        clicks += link.clicks;
        totalBookings += link.bookings.length;
        for (const b of link.bookings) {
          if (b.paymentStatus === 'PAID') {
            paidRevenue += b.amount;
          }
        }
      }

      return {
        userId: m.id,
        name: m.name || m.email,
        email: m.email,
        clicks,
        totalBookings,
        paidRevenue: Math.round(paidRevenue * 100) / 100,
      };
    });

    leaderboard.sort((a, b) => b.paidRevenue - a.paidRevenue);

    return { success: true, leaderboard };
  } catch (err: unknown) {
    console.error('Error in getMarketerLeaderboardAction:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to retrieve marketer leaderboard.',
    };
  }
}

// --- Reviews Moderation ---

function isValidReviewStatusTransition(currentStatus: ReviewStatus, newStatus: ReviewStatus): boolean {
  if (currentStatus === newStatus) return true;
  return ['PENDING', 'APPROVED', 'REJECTED'].includes(newStatus);
}

export async function updateReviewStatusAction(input: unknown) {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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

    const therapist = await db.therapist.findUnique({
      where: { id: validated.therapistId },
      include: {
        services: true,
        serviceAreas: true,
      },
    });

    if (!therapist || !therapist.isActive) {
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

    const offersService = therapist.services.some(
      (ts) => ts.serviceId === booking.serviceId && ts.isActive
    );

    if (!offersService) {
      return {
        success: false,
        error: 'This therapist cannot be assigned to this booking.',
      };
    }

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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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

    const updated = await db.therapist.update({
      where: { id },
      data: {
        ...(validated.name !== undefined && { name: validated.name }),
        ...(validated.bio !== undefined && { bio: validated.bio }),
        ...(validated.profileImage !== undefined && { profileImage: validated.profileImage || null }),
        ...(validated.email !== undefined && { email: validated.email }),
        ...(validated.phone !== undefined && { phone: validated.phone }),
        ...(validated.telegramChatId !== undefined && { telegramChatId: validated.telegramChatId || null }),
        ...(validated.hourlyRate !== undefined && { hourlyRate: validated.hourlyRate }),
        ...(validated.isActive !== undefined && { isActive: validated.isActive }),
        ...(validated.isFeatured !== undefined && { isFeatured: validated.isFeatured }),
        ...(validated.isHomepageSelected !== undefined && { isHomepageSelected: validated.isHomepageSelected }),
        ...(validated.offersStudio !== undefined && { offersStudio: validated.offersStudio }),
        ...(validated.offersInHome !== undefined && { offersInHome: validated.offersInHome }),
      },
    });

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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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

    await db.therapist.delete({ where: { id } });

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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);

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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
    const photo = await db.therapistPhoto.findFirst({
      where: { id: photoId, therapistId },
    });

    if (!photo) {
      return { success: false, error: 'Photo not found for this therapist.' };
    }

    await db.therapistPhoto.delete({ where: { id: photoId } });

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

// --- Services Assignments ---

export async function assignTherapistServiceAction(therapistId: string, input: unknown) {
  try {
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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

    if (!service.isActive) {
      return { success: false, error: 'Cannot assign an inactive service to a therapist.' };
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
    const therapist = await db.therapist.findUnique({ where: { id: therapistId } });
    if (!therapist) {
      return { success: false, error: 'Therapist not found.' };
    }

    const validated = serviceAreaSchema.parse(input);

    const startZip = validated.zipCode.trim();
    const endZip = validated.endZipCode ? validated.endZipCode.trim() : startZip;

    // Validate startZip and endZip against USZipCode table
    const { getZipInfo } = await import('@/lib/us-locations');
    const startInfo = await getZipInfo(startZip);
    if (!startInfo) {
      return { success: false, error: `ZIP code ${startZip} is not recognized in the official U.S. ZIP database.` };
    }

    if (startInfo.state !== validated.state) {
      return { success: false, error: `ZIP code ${startZip} belongs to ${startInfo.stateName} (${startInfo.state}), not ${validated.state}.` };
    }

    if (endZip && endZip !== startZip) {
      const endInfo = await getZipInfo(endZip);
      if (!endInfo) {
        return { success: false, error: `End ZIP code ${endZip} is not recognized in the official U.S. ZIP database.` };
      }
      if (endInfo.state !== validated.state) {
        return { success: false, error: `End ZIP code ${endZip} belongs to ${endInfo.stateName} (${endInfo.state}), not ${validated.state}.` };
      }
    }

    const existingArea = await db.serviceArea.findFirst({
      where: {
        therapistId,
        cityName: { equals: validated.cityName },
        state: { equals: validated.state },
        zipCode: { equals: startZip },
        endZipCode: endZip !== startZip ? { equals: endZip } : null,
      },
    });

    if (existingArea) {
      return { success: false, error: 'This coverage area already exists for this therapist.' };
    }

    const serviceArea = await db.serviceArea.create({
      data: {
        therapistId,
        cityName: validated.cityName,
        state: validated.state,
        zipCode: startZip,
        endZipCode: endZip !== startZip ? endZip : null,
      },
    });

    safeRevalidatePath(`/admin/therapists/${therapistId}`);
    return {
      success: true,
      serviceArea,
      serviceAreas: [serviceArea],
      count: 1,
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
    await checkServerAdminAuth(['SUPER_ADMIN', 'ADMIN']);
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
