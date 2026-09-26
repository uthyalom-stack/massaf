import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedCustomerSession } from '@/lib/auth-session';
import { createAdminNotification } from '@/lib/admin-notifications';

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || undefined;
    const session = await getVerifiedCustomerSession(cookieHeader);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your customer account to cancel bookings' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { bookingId, reason } = body;

    if (!bookingId || typeof bookingId !== 'string') {
      return NextResponse.json(
        { error: 'Booking ID parameter is required' },
        { status: 400 }
      );
    }

    // Query booking verifying customer ownership server-side
    const booking = await db.booking.findFirst({
      where: {
        id: bookingId,
        customerId: session.entityId,
      },
      include: {
        therapist: true,
        service: true,
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found or unauthorized' },
        { status: 404 }
      );
    }

    // Idempotency: If already cancelled, return success cleanly
    if (booking.status === 'CANCELLED') {
      return NextResponse.json({
        message: 'Booking is already cancelled',
        booking: {
          id: booking.id,
          bookingNumber: booking.bookingNumber,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
        },
      });
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

    if (booking.status === 'NO_SHOW') {
      return NextResponse.json(
        { error: 'No-show appointments cannot be cancelled' },
        { status: 400 }
      );
    }

    const cancelReasonText = reason && typeof reason === 'string' && reason.trim().length > 0
      ? reason.trim()
      : 'Cancelled by customer via account portal';

    // Update booking status to CANCELLED.
    // Preserve paymentStatus truthfully (do NOT mark REFUNDED unless an actual refund is processed)
    const updatedBooking = await db.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CANCELLED',
      },
    });

    // Create persistent Audit Log entry for timeline tracking
    try {
      await db.adminAuditLog.create({
        data: {
          actorUserId: session.entityId,
          actorEmail: session.email,
          actorRole: 'CUSTOMER',
          action: 'BOOKING_CANCELLED_BY_CUSTOMER',
          entityType: 'Booking',
          entityId: booking.id,
          description: `Customer ${session.email} cancelled appointment ${booking.bookingNumber}. Reason: ${cancelReasonText}`,
          metadataJson: JSON.stringify({
            bookingNumber: booking.bookingNumber,
            reason: cancelReasonText,
          }),
        },
      });
    } catch (auditErr) {
      console.warn('[AuditLog] Error logging customer cancellation:', auditErr);
    }

    // Create Admin Notification
    try {
      await createAdminNotification({
        type: 'BOOKING_CANCELLED',
        title: `Booking Cancelled (${booking.bookingNumber})`,
        message: `Customer cancelled appointment ${booking.bookingNumber}. Reason: ${cancelReasonText}`,
        link: `/admin/bookings/${booking.id}`,
      });
    } catch (adminNotifErr) {
      console.warn('[AdminNotif] Error creating admin cancellation notification:', adminNotifErr);
    }

    // Dispatch cancellation notification (email / telegram) with failure isolation
    try {
      const { notifyBookingCancelled } = await import('@/lib/notifications');
      await notifyBookingCancelled(updatedBooking.id, cancelReasonText);
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
