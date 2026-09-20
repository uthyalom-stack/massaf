import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedCustomerSession } from '@/lib/auth-session';

export async function POST(request: Request) {
  try {
    const session = await getVerifiedCustomerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your account to cancel bookings' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { bookingId, reason } = body;

    if (!bookingId || typeof bookingId !== 'string') {
      return NextResponse.json(
        { error: 'Booking ID is required' },
        { status: 400 }
      );
    }

    // Query booking verifying customer ownership server-side
    const booking = await db.booking.findFirst({
      where: {
        id: bookingId,
        customerId: session.entityId,
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found or unauthorized' },
        { status: 404 }
      );
    }

    if (booking.status === 'CANCELLED') {
      return NextResponse.json(
        { error: 'Booking is already cancelled' },
        { status: 400 }
      );
    }

    if (booking.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'Completed appointments cannot be cancelled' },
        { status: 400 }
      );
    }

    if (booking.status === 'REFUNDED') {
      return NextResponse.json(
        { error: 'Refunded bookings cannot be cancelled' },
        { status: 400 }
      );
    }

    // Update booking status to CANCELLED.
    // Preserve paymentStatus (do NOT mark REFUNDED as no automated PayLio refund integration exists)
    const updatedBooking = await db.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED',
      },
    });

    // Dispatch cancellation notification with failure isolation
    try {
      const { notifyBookingCancelled } = await import('@/lib/notifications');
      const cancelReason = reason ? String(reason).trim() : 'Cancelled by customer via account portal';
      await notifyBookingCancelled(updatedBooking.id, cancelReason);
    } catch (notifErr) {
      console.warn('notifyBookingCancelled dispatch warning:', notifErr);
    }

    return NextResponse.json({
      message: 'Booking cancelled successfully',
      booking: {
        id: updatedBooking.id,
        bookingNumber: updatedBooking.bookingNumber,
        status: updatedBooking.status,
        paymentStatus: updatedBooking.paymentStatus,
      },
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while cancelling your booking' },
      { status: 500 }
    );
  }
}
