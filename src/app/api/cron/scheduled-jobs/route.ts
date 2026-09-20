import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifyBookingExpired, notifyBookingReminder } from '@/lib/notifications';

/**
 * Server-only Scheduled Processing Route (Vercel Cron / Scheduled Job Compatible)
 * Protected route: Authorization header (Bearer <CRON_SECRET>) or x-cron-secret header.
 * Fails closed with HTTP 500 if CRON_SECRET is unconfigured.
 * Returns HTTP 401 if unauthenticated.
 *
 * Functions performed:
 * 1. Atomic cancel expired unpaid PENDING bookings created >= 30 minutes ago.
 * 2. Send 24-hour and 3-hour appointment reminders for active CONFIRMED bookings.
 * 3. Idempotent Atomic Claim + Retry on Failure:
 *    - Atomically claims booking (`reminder24hSentAt = now`).
 *    - Awaits notification dispatch.
 *    - If dispatch fails, resets `reminder24hSentAt = null` so future cron runs retry.
 *    - If dispatch succeeds, leaves `reminder24hSentAt` set.
 */
export async function GET(request: Request) {
  return handleScheduledJobs(request);
}

export async function POST(request: Request) {
  return handleScheduledJobs(request);
}

async function handleScheduledJobs(request: Request) {
  try {
    // 1. Strict Fail-Closed Cron Authentication Guard
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || cronSecret.trim().length === 0) {
      console.error('[SECURITY ERROR] CRON_SECRET is not configured on the server. Scheduled jobs route is failing closed.');
      return NextResponse.json(
        { error: 'Server configuration error: CRON_SECRET is not set' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('authorization');
    const cronSecretHeader = request.headers.get('x-cron-secret');

    let providedSecret: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      providedSecret = authHeader.substring(7).trim();
    } else if (cronSecretHeader) {
      providedSecret = cronSecretHeader.trim();
    }

    if (!providedSecret || providedSecret !== cronSecret) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid CRON_SECRET authorization header required' },
        { status: 401 }
      );
    }

    const now = new Date();
    const results = {
      expiredCount: 0,
      reminders24hCount: 0,
      reminders3hCount: 0,
    };

    // 2. ATOMIC UNPAID BOOKING EXPIRATION (30 MINUTES)
    // Any PENDING + UNPAID booking created >= 30 minutes ago is cancelled
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    const expiredCandidates = await db.booking.findMany({
      where: {
        status: 'PENDING',
        paymentStatus: {
          not: 'PAID',
        },
        createdAt: {
          lte: thirtyMinutesAgo,
        },
      },
      select: {
        id: true,
        bookingNumber: true,
      },
    });

    for (const candidate of expiredCandidates) {
      // Atomic state-guarded update: only updates if status is STILL PENDING and paymentStatus != PAID
      const updateResult = await db.booking.updateMany({
        where: {
          id: candidate.id,
          status: 'PENDING',
          paymentStatus: {
            not: 'PAID',
          },
        },
        data: {
          status: 'CANCELLED',
        },
      });

      if (updateResult.count > 0) {
        results.expiredCount++;
        try {
          await notifyBookingExpired(candidate.id);
        } catch (err) {
          console.error(`Error sending expired notification for ${candidate.bookingNumber}:`, err);
        }
      }
    }

    // 3. APPOINTMENT REMINDERS WITH ATOMIC CLAIM & RETRY-ON-FAILURE
    // 24-hour reminder window: 23 hours <= appointmentDateTime - now <= 25 hours
    const window24hStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const window24hEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const candidates24h = await db.booking.findMany({
      where: {
        status: 'CONFIRMED',
        reminder24hSentAt: null,
        appointmentDateTime: {
          gte: window24hStart,
          lte: window24hEnd,
        },
      },
      select: { id: true, bookingNumber: true },
    });

    for (const b of candidates24h) {
      // Atomic Claim: Set reminder24hSentAt = now only if it is currently null
      const claim = await db.booking.updateMany({
        where: {
          id: b.id,
          status: 'CONFIRMED',
          reminder24hSentAt: null,
        },
        data: {
          reminder24hSentAt: now,
        },
      });

      if (claim.count > 0) {
        const notifResult = await notifyBookingReminder(b.id, '24h');
        if (notifResult.success) {
          results.reminders24hCount++;
        } else {
          // Delivery failed -> Reset claim so next cron run can retry
          console.warn(`24h reminder delivery failed for ${b.bookingNumber}. Resetting reminder24hSentAt for retry.`);
          await db.booking.update({
            where: { id: b.id },
            data: { reminder24hSentAt: null },
          });
        }
      }
    }

    // 3-hour reminder window: 2.875 hours <= appointmentDateTime - now <= 3.125 hours
    const window3hStart = new Date(now.getTime() + 2.875 * 60 * 60 * 1000);
    const window3hEnd = new Date(now.getTime() + 3.125 * 60 * 60 * 1000);

    const candidates3h = await db.booking.findMany({
      where: {
        status: 'CONFIRMED',
        reminder3hSentAt: null,
        appointmentDateTime: {
          gte: window3hStart,
          lte: window3hEnd,
        },
      },
      select: { id: true, bookingNumber: true },
    });

    for (const b of candidates3h) {
      // Atomic Claim: Set reminder3hSentAt = now only if it is currently null
      const claim = await db.booking.updateMany({
        where: {
          id: b.id,
          status: 'CONFIRMED',
          reminder3hSentAt: null,
        },
        data: {
          reminder3hSentAt: now,
        },
      });

      if (claim.count > 0) {
        const notifResult = await notifyBookingReminder(b.id, '3h');
        if (notifResult.success) {
          results.reminders3hCount++;
        } else {
          // Delivery failed -> Reset claim so next cron run can retry
          console.warn(`3h reminder delivery failed for ${b.bookingNumber}. Resetting reminder3hSentAt for retry.`);
          await db.booking.update({
            where: { id: b.id },
            data: { reminder3hSentAt: null },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      processed: results,
    });
  } catch (error) {
    console.error('Error in scheduled-jobs route:', error);
    return NextResponse.json(
      { error: 'Internal server error processing scheduled jobs' },
      { status: 500 }
    );
  }
}
