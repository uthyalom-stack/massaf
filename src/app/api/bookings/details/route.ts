import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVerifiedCustomerSession, getVerifiedTherapistSession, getVerifiedAdminSession } from '@/lib/auth-session';

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
        therapist: true,
        service: true,
        review: true,
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Access control check: Must be authenticated customer (owning booking), therapist assigned, admin, or recently created PENDING/UNPAID booking within 15-minute checkout window
    const cookieHeader = request.headers.get('cookie') || undefined;
    const customerSession = await getVerifiedCustomerSession(cookieHeader);
    const therapistSession = await getVerifiedTherapistSession(cookieHeader);
    const adminSession = await getVerifiedAdminSession(cookieHeader);

    const isCustomerOwner = customerSession && customerSession.entityId === booking.customerId;
    const isAssignedTherapist = therapistSession && therapistSession.entityId === booking.therapistId;
    const isAdmin = Boolean(adminSession);
    const isRecentUnpaidCheckout = booking.paymentStatus === 'UNPAID' && (Date.now() - booking.createdAt.getTime() <= 15 * 60 * 1000);

    if (!isCustomerOwner && !isAssignedTherapist && !isAdmin && !isRecentUnpaidCheckout) {
      return NextResponse.json(
        { error: 'Unauthorized: Access to booking details is restricted' },
        { status: 401 }
      );
    }

    const therapistName = booking.therapist?.name || 'Assigned Therapist';
    const serviceName = booking.service?.name || 'Massage Therapy Session';

    // Strict Privacy boundary: Do NOT return customer name, email, phone, full address, or internal database customer IDs
    return NextResponse.json({
      booking: {
        id: booking.id,
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        amount: booking.amount,
        appointmentDateTime: booking.appointmentDateTime.toISOString(),
        durationMinutes: booking.durationMinutes,
        locationType: booking.locationType,
        therapistName,
        serviceName,
        hasReview: !!booking.review,
        existingReview: booking.review
          ? {
              rating: booking.review.rating,
              comment: booking.review.comment,
              status: booking.review.status,
            }
          : null,
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
