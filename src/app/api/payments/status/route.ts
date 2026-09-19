import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { paylioClient } from '@/lib/paylio';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('bookingId') || searchParams.get('id');
    const bookingNumber = searchParams.get('bookingNumber') || searchParams.get('number');

    if (!bookingId && !bookingNumber) {
      return NextResponse.json(
        { error: 'Booking ID or booking number parameter is required.' },
        { status: 400 }
      );
    }

    const whereClause = bookingId
      ? { id: bookingId }
      : { bookingNumber: bookingNumber! };

    const booking = await db.booking.findFirst({
      where: whereClause,
      include: {
        service: true,
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking record not found.' },
        { status: 404 }
      );
    }

    // If payment status in DB is PENDING and paymentReference exists, check if PayLio status has changed
    let currentPaymentStatus = booking.paymentStatus;
    let currentBookingStatus = booking.status;

    if (booking.paymentStatus === 'PENDING' && booking.paymentReference) {
      try {
        const paylioStatus = await paylioClient.getPaymentStatus(booking.paymentReference);
        if (paylioStatus.status === 'PAID') {
          // Perform server update if PayLio reflects payment success
          const updatedBooking = await db.booking.update({
            where: { id: booking.id },
            data: {
              paymentStatus: 'PAID',
              status: booking.status === 'PENDING' ? 'CONFIRMED' : booking.status,
            },
            select: {
              status: true,
              paymentStatus: true,
            },
          });
          currentPaymentStatus = updatedBooking.paymentStatus;
          currentBookingStatus = updatedBooking.status;
        } else if (paylioStatus.status === 'FAILED' || paylioStatus.status === 'EXPIRED') {
          const updatedBooking = await db.booking.update({
            where: { id: booking.id },
            data: {
              paymentStatus: 'FAILED',
            },
            select: {
              status: true,
              paymentStatus: true,
            },
          });
          currentPaymentStatus = updatedBooking.paymentStatus;
          currentBookingStatus = updatedBooking.status;
        }
      } catch (checkErr) {
        console.error('Error re-checking PayLio payment status in GET /api/payments/status:', checkErr);
      }
    }

    const isPayable =
      !['CANCELLED', 'REFUNDED'].includes(currentBookingStatus) &&
      currentPaymentStatus !== 'PAID';

    return NextResponse.json({
      bookingNumber: booking.bookingNumber,
      bookingId: booking.id,
      status: currentBookingStatus,
      paymentStatus: currentPaymentStatus,
      paymentMethod: booking.paymentMethod,
      amount: booking.amount,
      serviceName: booking.service.name,
      isPayable,
    });
  } catch (error) {
    console.error('Error fetching payment status:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while looking up payment status.' },
      { status: 500 }
    );
  }
}
