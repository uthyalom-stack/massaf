import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedCustomerSession } from '@/lib/auth-session';
import { formatDbTherapistToPublic } from '@/lib/db-therapists';
import { isAppointmentTimeAvailable } from '@/lib/availability';
import { parseAppointmentDateTime } from '@/lib/timezone';

export async function POST(request: Request) {
  try {
    const session = await getVerifiedCustomerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your account to reschedule bookings' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { bookingId, date, time } = body;

    if (!bookingId || !date || !time) {
      return NextResponse.json(
        { error: 'Booking ID, date, and time parameters are required' },
        { status: 400 }
      );
    }

    // 1. Fetch existing booking establishing server-side customer ownership
    const booking = await db.booking.findFirst({
      where: {
        id: bookingId,
        customerId: session.entityId,
      },
      include: {
        therapist: {
          include: {
            services: {
              where: { isActive: true, service: { isActive: true } },
              include: { service: true },
            },
            availabilities: true,
            photos: true,
            serviceAreas: true,
          },
        },
        service: true,
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found or unauthorized' },
        { status: 404 }
      );
    }

    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED' || booking.status === 'REFUNDED') {
      return NextResponse.json(
        { error: `Bookings with status ${booking.status} cannot be rescheduled` },
        { status: 400 }
      );
    }

    if (!booking.therapist || !booking.therapist.isActive) {
      return NextResponse.json(
        { error: 'Assigned therapist is no longer active or available for rescheduling' },
        { status: 400 }
      );
    }

    if (!booking.service || !booking.service.isActive) {
      return NextResponse.json(
        { error: 'Service is no longer active' },
        { status: 400 }
      );
    }

    // 2. Parse new appointment date/time deterministically
    let newAppointmentDateTime: Date;
    try {
      newAppointmentDateTime = parseAppointmentDateTime(date, time);
    } catch {
      return NextResponse.json(
        { error: 'Invalid date or time format provided' },
        { status: 400 }
      );
    }

    if (newAppointmentDateTime.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'Appointment date and time must be in the future' },
        { status: 400 }
      );
    }

    // 3. Authoritative server-side working hours availability check
    const publicTherapist = formatDbTherapistToPublic(booking.therapist);
    const availabilityCheck = isAppointmentTimeAvailable(
      publicTherapist,
      date,
      time,
      booking.durationMinutes
    );

    if (!availabilityCheck.isValid) {
      return NextResponse.json(
        { error: availabilityCheck.reason || 'Selected time is outside therapist working schedule' },
        { status: 400 }
      );
    }

    // 4. Atomic transaction overlap check excluding current booking ID
    const requestedStart = newAppointmentDateTime.getTime();
    const requestedEnd = requestedStart + booking.durationMinutes * 60 * 1000;

    const rescheduleResult = await db.$transaction(async (tx) => {
      const existingBookings = await tx.booking.findMany({
        where: {
          therapistId: booking.therapistId,
          id: { not: booking.id }, // Exclude current booking from conflict check
          status: { notIn: ['CANCELLED', 'REFUNDED'] },
          appointmentDateTime: { lt: new Date(requestedEnd) },
        },
        select: {
          id: true,
          appointmentDateTime: true,
          durationMinutes: true,
        },
      });

      const hasConflict = existingBookings.some((existing) => {
        const existingStart = existing.appointmentDateTime.getTime();
        const existingEnd = existingStart + existing.durationMinutes * 60 * 1000;
        return existingStart < requestedEnd && existingEnd > requestedStart;
      });

      if (hasConflict) {
        return { conflict: true };
      }

      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: {
          appointmentDateTime: newAppointmentDateTime,
          // Reset reminder timestamps if rescheduling to ensure reminders fire again for new time
          reminder24hSentAt: null,
          reminder3hSentAt: null,
        },
      });

      return { booking: updated, oldDateTime: booking.appointmentDateTime };
    });

    if (!('booking' in rescheduleResult) || !rescheduleResult.booking) {
      return NextResponse.json(
        { error: 'The requested appointment slot is already booked. Please select another time.' },
        { status: 400 }
      );
    }

    // Trigger reschedule notification with failure isolation
    try {
      const { notifyBookingRescheduled } = await import('@/lib/notifications');
      await notifyBookingRescheduled(
        rescheduleResult.booking.id,
        rescheduleResult.oldDateTime,
        rescheduleResult.booking.appointmentDateTime
      );
    } catch (notifErr) {
      console.warn('notifyBookingRescheduled dispatch warning:', notifErr);
    }

    return NextResponse.json({
      message: 'Appointment rescheduled successfully',
      booking: {
        id: rescheduleResult.booking.id,
        bookingNumber: rescheduleResult.booking.bookingNumber,
        appointmentDateTime: rescheduleResult.booking.appointmentDateTime.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error rescheduling booking:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while rescheduling your booking' },
      { status: 500 }
    );
  }
}
