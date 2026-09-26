import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedTherapistSession } from '@/lib/auth-session';

export async function PUT(request: Request) {
  try {
    const session = await getVerifiedTherapistSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your therapist session' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { bookingId, status } = body;

    if (!bookingId || !status) {
      return NextResponse.json(
        { error: 'Booking ID and status are required' },
        { status: 400 }
      );
    }

    const allowedStatuses = ['IN_PROGRESS', 'COMPLETED', 'NO_SHOW'];
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status transition. Allowed statuses: IN_PROGRESS, COMPLETED, NO_SHOW' },
        { status: 400 }
      );
    }

    // Verify booking exists and is strictly assigned to this authenticated therapist
    const booking = await db.booking.findFirst({
      where: {
        id: bookingId,
        therapistId: session.entityId,
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found or not assigned to you' },
        { status: 404 }
      );
    }

    if (booking.status === 'CANCELLED' || booking.status === 'REFUNDED') {
      return NextResponse.json(
        { error: `Cancelled or refunded bookings cannot be updated to ${status}` },
        { status: 400 }
      );
    }

    const updatedBooking = await db.booking.update({
      where: { id: booking.id },
      data: {
        status: status as 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW',
      },
    });

    if (status === 'COMPLETED') {
      try {
        const { notifyBookingCompleted } = await import('@/lib/notifications');
        await notifyBookingCompleted(updatedBooking.id);
      } catch (notifErr) {
        console.warn('notifyBookingCompleted dispatch warning:', notifErr);
      }
    }

    return NextResponse.json({
      message: `Appointment status updated to ${status}`,
      booking: {
        id: updatedBooking.id,
        bookingNumber: updatedBooking.bookingNumber,
        status: updatedBooking.status,
      },
    });
  } catch (error) {
    console.error('Error updating therapist appointment status:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while updating appointment status' },
      { status: 500 }
    );
  }
}
