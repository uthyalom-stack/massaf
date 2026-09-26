import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedTherapistSession } from '@/lib/auth-session';
import { createAdminNotification } from '@/lib/admin-notifications';

export async function PUT(request: Request) {
  try {
    const cookieHeader = request.headers.get('cookie') || undefined;
    const session = await getVerifiedTherapistSession(cookieHeader);
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
        { error: 'Booking ID and status parameters are required' },
        { status: 400 }
      );
    }

    const allowedStatuses = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW'];
    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status transition. Allowed statuses: CONFIRMED, IN_PROGRESS, COMPLETED, NO_SHOW' },
        { status: 400 }
      );
    }

    // Verify booking exists and is strictly assigned to this authenticated therapist
    const booking = await db.booking.findFirst({
      where: {
        id: bookingId,
        therapistId: session.entityId,
      },
      include: {
        customer: true,
        service: true,
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
        status: status as 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'NO_SHOW',
      },
    });

    // Audit Log Entry
    try {
      await db.adminAuditLog.create({
        data: {
          actorUserId: session.entityId,
          actorEmail: session.email,
          actorRole: 'THERAPIST',
          action: 'THERAPIST_APPOINTMENT_STATUS_UPDATED',
          entityType: 'Booking',
          entityId: booking.id,
          description: `Therapist ${session.email} updated appointment ${booking.bookingNumber} status to ${status}.`,
          metadataJson: JSON.stringify({
            bookingNumber: booking.bookingNumber,
            oldStatus: booking.status,
            newStatus: status,
          }),
        },
      });
    } catch (auditErr) {
      console.warn('[AuditLog] Error logging therapist appointment status update:', auditErr);
    }

    // Admin Notification
    try {
      await createAdminNotification({
        type: 'THERAPIST_STATUS_UPDATE',
        title: `Appointment ${status} (${booking.bookingNumber})`,
        message: `Therapist updated booking ${booking.bookingNumber} status to ${status}.`,
        link: `/admin/bookings/${booking.id}`,
      });
    } catch (adminNotifErr) {
      console.warn('[AdminNotif] Error creating admin notification:', adminNotifErr);
    }

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
