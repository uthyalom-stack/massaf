import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifyBookingExpired, notifyBookingReminder } from '@/lib/notifications';

/**
 * Server-only Scheduled Processing Route (Vercel Cron / Scheduled Job Compatible)
 * Protected route: Authorization header (Bearer <CRON_SECRET>) or x-cron-secret header.
 * Fails closed with HTTP 500 if CRON_SECRET is unconfigured.
 * Returns HTTP 401 if unauthenticated.
 * Functions performed:
 * 1. Atomic cancel expired unpaid PENDING bookings after 30 minutes.
 * 2. Send 24-hour (~23.875h - 24.125h) and 3-hour (~2.875h - 3.125h) appointment reminders for active CONFIRMED bookings atomically.
 */
export async function GET(request: Request) {
  return handleScheduledJobs(request);
}

export async function POST(request: Request) {
  return handleScheduledJobs(request);
}

async function handleScheduledJobs(request: Request) {
  try {
    // 1. Fail-Closed Cron Authentication Guard
    const cronSecret = process.env.CRON_SECRET || process.env.MASSAF_ADMIN_API_KEY;

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
        { error: 'Unauthorized: Valid cron authorization header required' },
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

    // 3. APPOINTMENT REMINDERS WITH ATOMIC CLAIM IDEMPOTENCY
    // 24-hour reminder window: Appointments scheduled between 23.875h and 24.125h from now (15-min cron window)
    const window24hStart = new Date(now.getTime() + (23.875 * 60 * 60 * 1000));
    const window24hEnd = new Date(now.getTime() + (24.125 * 60 * 60 * 1000));

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
      // Atomic Claim: Update reminder24hSentAt only if it is currently null
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
        try {
          await notifyBookingReminder(b.id, '24h');
          results.reminders24hCount++;
        } catch (err) {
          console.error(`Error sending 24h reminder for ${b.bookingNumber}:`, err);
        }
      }
    }

    // 3-hour reminder window: Appointments scheduled between 2.875h and 3.125h from now (15-min cron window)
    const window3hStart = new Date(now.getTime() + (2.875 * 60 * 60 * 1000));
    const window3hEnd = new Date(now.getTime() + (3.125 * 60 * 60 * 1000));

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
      // Atomic Claim: Update reminder3hSentAt only if it is currently null
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
        try {
          await notifyBookingReminder(b.id, '3h');
          results.reminders3hCount++;
        } catch (err) {
          console.error(`Error sending 3h reminder for ${b.bookingNumber}:`, err);
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
