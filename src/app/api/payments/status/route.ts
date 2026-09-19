import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { paylioClient, confirmVerifiedPayLioPayment } from '@/lib/paylio';
import { BookingStatus, PaymentStatus } from '@prisma/client';

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

    let currentPaymentStatus: PaymentStatus = booking.paymentStatus;
    let currentBookingStatus: BookingStatus = booking.status;

    // If payment status in DB is PENDING and paymentReference (ipn_token) exists, re-check PayLio status
    if (booking.paymentStatus === 'PENDING' && booking.paymentReference) {
      try {
        const paylioStatus = await paylioClient.getPaymentStatus(booking.paymentReference);
        if (paylioStatus.status !== 'PENDING' && paylioStatus.status !== 'UNKNOWN') {
          const transitionResult = await confirmVerifiedPayLioPayment({
            bookingId: booking.id,
            ipnToken: booking.paymentReference,
            providerStatus: paylioStatus.status,
            providerOriginalAmount: paylioStatus.originalAmount,
            providerCurrency: paylioStatus.currency,
            providerMethod: paylioStatus.paymentMethod,
          });
          currentPaymentStatus = transitionResult.paymentStatus as PaymentStatus;
          currentBookingStatus = transitionResult.bookingStatus as BookingStatus;
        }
      } catch (checkErr) {
        console.error('Error re-checking PayLio payment status in GET /api/payments/status:', checkErr);
      }
    }

    const isPayable =
      !['CANCELLED', 'REFUNDED'].includes(currentBookingStatus) &&
      currentPaymentStatus !== 'PAID';

    // Strictly limit returned fields to safe customer information
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
