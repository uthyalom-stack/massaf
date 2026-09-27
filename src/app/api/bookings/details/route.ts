import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedCustomerSession, getVerifiedTherapistSession, getVerifiedAdminSession, extractCheckoutToken, verifyCheckoutToken } from '@/lib/auth-session';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Booking ID parameter is required' },
        { status: 400 }
      );
    }

    const booking = await db.booking.findUnique({
      where: { id },
      include: {
        therapist: {
          select: {
            id: true,
            name: true,
            profileImage: true,
            rating: true,
            reviewCount: true,
            offersStudio: true,
            offersInHome: true,
          },
        },
        service: {
          select: {
            id: true,
            name: true,
            description: true,
            durationMinutes: true,
            price: true,
          },
        },
        review: true,
        refunds: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Access control check: Must be authenticated customer (owning booking), therapist assigned, admin, or guest with a valid checkout token
    const cookieHeader = request.headers.get('cookie') || undefined;
    const customerSession = await getVerifiedCustomerSession(cookieHeader);
    const therapistSession = await getVerifiedTherapistSession(cookieHeader);
    const adminSession = await getVerifiedAdminSession(cookieHeader);
    const token = extractCheckoutToken(request);

    const isCustomerOwner = Boolean(customerSession && customerSession.entityId === booking.customerId);
    const isAssignedTherapist = Boolean(therapistSession && therapistSession.entityId === booking.therapistId);
    const isAdmin = Boolean(adminSession);
    const hasValidCheckoutToken = Boolean(token && verifyCheckoutToken(token, booking.id));

    if (!isCustomerOwner && !isAssignedTherapist && !isAdmin && !hasValidCheckoutToken) {
      return NextResponse.json(
        { error: 'Unauthorized: Access to booking details is restricted' },
        { status: 401 }
      );
    }

    // Determine eligibility flags server-side
    const canCancel = booking.status !== 'CANCELLED' && booking.status !== 'COMPLETED' && booking.status !== 'REFUNDED' && booking.status !== 'NO_SHOW';
    const canReschedule = booking.status === 'PENDING' || booking.status === 'CONFIRMED' || booking.status === 'ASSIGNED';
    const canReview = booking.status === 'COMPLETED' && !booking.review && isCustomerOwner;

    // Fetch relevant audit logs for activity history
    const auditLogs = await db.adminAuditLog.findMany({
      where: {
        entityType: 'Booking',
        entityId: booking.id,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Construct customer-safe activity timeline
    const timeline: Array<{ id: string; timestamp: string; title: string; description: string }> = [];

    // 1. Initial Creation Event
    timeline.push({
      id: `created-${booking.id}`,
      timestamp: booking.createdAt.toISOString(),
      title: 'Booking Created',
      description: 'Appointment reservation initialized.',
    });

    // 2. Audit log events (customer-safe filtering)
    for (const log of auditLogs) {
      let safeTitle = log.action.replace(/_/g, ' ');
      let safeDesc = log.description;

      if (log.action === 'BOOKING_CANCELLED_BY_CUSTOMER') {
        safeTitle = 'Booking Cancelled';
        safeDesc = 'Appointment cancelled by customer.';
      } else if (log.action === 'BOOKING_RESCHEDULED_BY_CUSTOMER') {
        safeTitle = 'Appointment Rescheduled';
        safeDesc = 'Appointment date and time rescheduled.';
      } else if (log.action === 'BOOKING_CONFIRMED_PAYLIO' || log.action === 'BOOKING_CONFIRMED_NOWPAYMENTS') {
        safeTitle = 'Payment Confirmed';
        safeDesc = 'Payment verified and appointment confirmed.';
      } else if (log.action === 'BOOKING_EXPIRED_UNPAID') {
        safeTitle = 'Booking Expired';
        safeDesc = 'Reservation expired due to non-payment.';
      }

      timeline.push({
        id: log.id,
        timestamp: log.createdAt.toISOString(),
        title: safeTitle,
        description: safeDesc,
      });
    }

    // 3. Reminders
    if (booking.reminder24hSentAt) {
      timeline.push({
        id: `rem24-${booking.id}`,
        timestamp: booking.reminder24hSentAt.toISOString(),
        title: '24-Hour Reminder Sent',
        description: '24-hour appointment reminder sent.',
      });
    }

    if (booking.reminder3hSentAt) {
      timeline.push({
        id: `rem3-${booking.id}`,
        timestamp: booking.reminder3hSentAt.toISOString(),
        title: '3-Hour Reminder Sent',
        description: '3-hour appointment reminder sent.',
      });
    }

    // 4. Refunds
    for (const ref of booking.refunds) {
      timeline.push({
        id: ref.id,
        timestamp: ref.createdAt.toISOString(),
        title: `Refund Status: ${ref.status}`,
        description: `Refund record of $${ref.amount.toFixed(2)} (${ref.status.toLowerCase()}).`,
      });
    }

    // Sort timeline descending by timestamp
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const therapistName = booking.therapist?.name || 'Assigned Therapist';
    const serviceName = booking.service?.name || 'Massage Therapy Session';

    return NextResponse.json({
      booking: {
        id: booking.id,
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        paymentReference: booking.paymentReference,
        amount: booking.amount,
        hourlyRateUsed: booking.hourlyRateUsed,
        calculatedTotal: booking.calculatedTotal,
        appointmentDateTime: booking.appointmentDateTime.toISOString(),
        durationMinutes: booking.durationMinutes,
        locationType: booking.locationType,
        addressLine1: booking.addressLine1,
        addressLine2: booking.addressLine2,
        city: booking.city,
        state: booking.state,
        zipCode: booking.zipCode,
        notes: booking.notes,
        createdAt: booking.createdAt.toISOString(),
        therapistName,
        serviceName,
        therapist: booking.therapist
          ? {
              id: booking.therapist.id,
              name: booking.therapist.name,
              profileImage: booking.therapist.profileImage,
              rating: booking.therapist.rating,
              reviewCount: booking.therapist.reviewCount,
              offersStudio: booking.therapist.offersStudio,
              offersInHome: booking.therapist.offersInHome,
            }
          : null,
        service: booking.service
          ? {
              id: booking.service.id,
              name: booking.service.name,
              description: booking.service.description,
              durationMinutes: booking.service.durationMinutes,
              price: booking.service.price,
            }
          : null,
        canCancel,
        canReschedule,
        canReview,
        hasReview: !!booking.review,
        existingReview: booking.review
          ? {
              id: booking.review.id,
              rating: booking.review.rating,
              comment: booking.review.comment,
              status: booking.review.status,
            }
          : null,
        timeline,
      },
    });
  } catch (error) {
    console.error('Error fetching booking details:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve booking information' },
      { status: 500 }
    );
  }
}
