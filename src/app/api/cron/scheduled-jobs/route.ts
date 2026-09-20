import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { notifyBookingExpired, notifyBookingReminder } from '@/lib/notifications';

/**
 * Server-only Scheduled Processing Route (Vercel Cron / Scheduled Job Compatible)
 * Protected route: Authorization header (Bearer <CRON_SECRET>) or query string parameter (?secret=<CRON_SECRET>).
 * Functions performed:
 * 1. Cancel expired unpaid PENDING bookings after 30 minutes.
 * 2. Send 24-hour and same-day appointment reminders for active CONFIRMED bookings.
 */
export async function GET(request: Request) {
  return handleScheduledJobs(request);
}

export async function POST(request: Request) {
  return handleScheduledJobs(request);
}

async function handleScheduledJobs(request: Request) {
  try {
    // 1. Authorization Guard
    const cronSecret = process.env.CRON_SECRET || process.env.MASSAF_ADMIN_API_KEY;
    const { searchParams } = new URL(request.url);
    const authHeader = request.headers.get('authorization');
    const paramSecret = searchParams.get('secret');

    let providedSecret: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      providedSecret = authHeader.substring(7).trim();
    } else if (paramSecret) {
      providedSecret = paramSecret.trim();
    } else {
      providedSecret = request.headers.get('x-cron-secret');
    }

    if (cronSecret && cronSecret.trim().length > 0) {
      if (!providedSecret || providedSecret !== cronSecret) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid cron secret provided' },
          { status: 401 }
        );
      }
    }

    const now = new Date();
    const results = {
      expiredCount: 0,
      reminders24hCount: 0,
      remindersSameDayCount: 0,
    };

    // 2. UNPAID BOOKING EXPIRATION (30 MINUTES)
    // Find PENDING + UNPAID bookings created >= 30 minutes ago
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
        status: true,
        paymentStatus: true,
      },
    });

    for (const candidate of expiredCandidates) {
      // Re-verify status in case payment was verified concurrently
      const freshBooking = await db.booking.findUnique({
        where: { id: candidate.id },
        select: { status: true, paymentStatus: true },
      });

      if (freshBooking && freshBooking.status === 'PENDING' && freshBooking.paymentStatus !== 'PAID') {
        await db.booking.update({
          where: { id: candidate.id },
          data: {
            status: 'CANCELLED',
          },
        });

        results.expiredCount++;

        // Trigger notification asynchronously with failure isolation
        try {
          await notifyBookingExpired(candidate.id);
        } catch (err) {
          console.error(`Error sending expired notification for ${candidate.bookingNumber}:`, err);
        }
      }
    }

    // 3. APPOINTMENT REMINDERS (24-Hour and Same-Day / 2-Hour)
    // 24-hour window: Appointments scheduled between 23h and 25h from now
    const window24hStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const window24hEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const bookings24h = await db.booking.findMany({
      where: {
        status: 'CONFIRMED',
        appointmentDateTime: {
          gte: window24hStart,
          lte: window24hEnd,
        },
      },
      select: { id: true, bookingNumber: true },
    });

    for (const b of bookings24h) {
      try {
        await notifyBookingReminder(b.id, '24h');
        results.reminders24hCount++;
      } catch (err) {
        console.error(`Error sending 24h reminder for ${b.bookingNumber}:`, err);
      }
    }

    // Same-day / 2-hour window: Appointments scheduled between 1h and 3h from now
    const windowSameDayStart = new Date(now.getTime() + 1 * 60 * 60 * 1000);
    const windowSameDayEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000);

    const bookingsSameDay = await db.booking.findMany({
      where: {
        status: 'CONFIRMED',
        appointmentDateTime: {
          gte: windowSameDayStart,
          lte: windowSameDayEnd,
        },
      },
      select: { id: true, bookingNumber: true },
    });

    for (const b of bookingsSameDay) {
      try {
        await notifyBookingReminder(b.id, 'same_day');
        results.remindersSameDayCount++;
      } catch (err) {
        console.error(`Error sending same-day reminder for ${b.bookingNumber}:`, err);
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
