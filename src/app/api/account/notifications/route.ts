import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedCustomerSession } from '@/lib/auth-session';
import { formatUtcDateString, formatUtcTimeString } from '@/lib/timezone';
import { cookies } from 'next/headers';

const READ_NOTIFS_COOKIE = 'massaf_cust_read_notifs';

interface CustomerNotification {
  id: string;
  type: 'BOOKING_CREATED' | 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED' | 'BOOKING_COMPLETED' | 'PAYMENT_FAILED';
  title: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  link: string;
  bookingNumber: string;
}

export async function GET() {
  try {
    const session = await getVerifiedCustomerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your account to view notifications' },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();
    const readCookieVal = cookieStore.get(READ_NOTIFS_COOKIE)?.value;
    let readNotifIds: string[] = [];
    if (readCookieVal) {
      try {
        readNotifIds = JSON.parse(readCookieVal);
      } catch {
        readNotifIds = [];
      }
    }

    // Fetch customer bookings
    const bookings = await db.booking.findMany({
      where: { customerId: session.entityId },
      include: {
        therapist: true,
        service: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });

    const notifications: CustomerNotification[] = [];

    for (const b of bookings) {
      const dateStr = formatUtcDateString(b.appointmentDateTime.toISOString());
      const timeStr = formatUtcTimeString(b.appointmentDateTime.toISOString());
      const therapistName = b.therapist ? b.therapist.name : 'Your therapist';
      const serviceName = b.service ? b.service.name : 'Massage Service';
      const link = `/booking/success?id=${b.id}`;

      if (b.status === 'COMPLETED') {
        const notifId = `notif_comp_${b.id}`;
        notifications.push({
          id: notifId,
          type: 'BOOKING_COMPLETED',
          title: 'Appointment Completed',
          message: `Your ${serviceName} session with ${therapistName} on ${dateStr} is completed. Please leave a review!`,
          createdAt: b.updatedAt.toISOString(),
          isRead: readNotifIds.includes(notifId),
          link,
          bookingNumber: b.bookingNumber,
        });
      } else if (b.paymentStatus === 'PAID' || b.status === 'CONFIRMED' || b.status === 'ASSIGNED') {
        const notifId = `notif_conf_${b.id}`;
        notifications.push({
          id: notifId,
          type: 'BOOKING_CONFIRMED',
          title: 'Booking Confirmed!',
          message: `Payment verified for booking ${b.bookingNumber} (${serviceName}). Scheduled for ${dateStr} at ${timeStr}.`,
          createdAt: b.updatedAt.toISOString(),
          isRead: readNotifIds.includes(notifId),
          link,
          bookingNumber: b.bookingNumber,
        });
      } else if (b.status === 'CANCELLED' || b.status === 'REFUNDED') {
        const notifId = `notif_canc_${b.id}`;
        notifications.push({
          id: notifId,
          type: 'BOOKING_CANCELLED',
          title: 'Booking Cancelled',
          message: `Booking ${b.bookingNumber} for ${serviceName} was cancelled or expired due to non-payment.`,
          createdAt: b.updatedAt.toISOString(),
          isRead: readNotifIds.includes(notifId),
          link,
          bookingNumber: b.bookingNumber,
        });
      } else if (b.paymentStatus === 'FAILED') {
        const notifId = `notif_fail_${b.id}`;
        notifications.push({
          id: notifId,
          type: 'PAYMENT_FAILED',
          title: 'Payment Failed',
          message: `Payment for booking ${b.bookingNumber} was not completed. Click to retry payment.`,
          createdAt: b.updatedAt.toISOString(),
          isRead: readNotifIds.includes(notifId),
          link,
          bookingNumber: b.bookingNumber,
        });
      } else if (b.status === 'PENDING') {
        const notifId = `notif_pend_${b.id}`;
        notifications.push({
          id: notifId,
          type: 'BOOKING_CREATED',
          title: 'Booking Received — Payment Pending',
          message: `Booking ${b.bookingNumber} is reserved. Complete payment within 30 minutes to confirm your time slot.`,
          createdAt: b.createdAt.toISOString(),
          isRead: readNotifIds.includes(notifId),
          link,
          bookingNumber: b.bookingNumber,
        });
      }
    }

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return NextResponse.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('Error fetching customer notifications:', error);
    return NextResponse.json(
      { error: 'An error occurred while loading customer notifications' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getVerifiedCustomerSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized: Please verify your account to manage notifications' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { notificationId, markAllRead } = body;

    const cookieStore = await cookies();
    const readCookieVal = cookieStore.get(READ_NOTIFS_COOKIE)?.value;
    let readNotifIds: string[] = [];
    if (readCookieVal) {
      try {
        readNotifIds = JSON.parse(readCookieVal);
      } catch {
        readNotifIds = [];
      }
    }

    if (markAllRead) {
      // Mark all read by fetching IDs
      const bookings = await db.booking.findMany({
        where: { customerId: session.entityId },
        select: { id: true },
      });
      const allIds = bookings.flatMap((b) => [
        `notif_comp_${b.id}`,
        `notif_conf_${b.id}`,
        `notif_canc_${b.id}`,
        `notif_fail_${b.id}`,
        `notif_pend_${b.id}`,
      ]);
      readNotifIds = Array.from(new Set([...readNotifIds, ...allIds]));
    } else if (notificationId && typeof notificationId === 'string') {
      const bookingId = notificationId.replace(/^notif_(comp|conf|canc|fail|pend)_/, '');
      const validBooking = await db.booking.findFirst({
        where: { id: bookingId, customerId: session.entityId },
      });
      if (validBooking && !readNotifIds.includes(notificationId)) {
        readNotifIds.push(notificationId);
      }
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set(READ_NOTIFS_COOKIE, JSON.stringify(readNotifIds), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (error) {
    console.error('Error marking customer notification as read:', error);
    return NextResponse.json(
      { error: 'An error occurred while updating notifications' },
      { status: 500 }
    );
  }
}
