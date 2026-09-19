import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { paylioClient, confirmVerifiedPayLioPayment } from '@/lib/paylio';

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

    let updatedBooking = booking;

    // If payment status in DB is PENDING and paymentReference (ipn_token) exists, re-check PayLio status
    if (booking.paymentStatus === 'PENDING' && booking.paymentReference) {
      try {
        const paylioStatus = await paylioClient.getPaymentStatus(booking.paymentReference);
        if (paylioStatus.status !== 'PENDING' && paylioStatus.status !== 'UNKNOWN') {
          await confirmVerifiedPayLioPayment({
            bookingId: booking.id,
            ipnToken: booking.paymentReference,
            providerStatus: paylioStatus.status,
            providerOriginalAmount: paylioStatus.originalAmount,
            providerCurrency: paylioStatus.currency,
            providerMethod: paylioStatus.paymentMethod,
          });

          // Reload booking from DB to ensure fresh paymentStatus, status, and paymentMethod
          const reloaded = await db.booking.findUnique({
            where: { id: booking.id },
            include: { service: true },
          });
          if (reloaded) {
            updatedBooking = reloaded;
          }
        }
      } catch (checkErr) {
        console.error('Error re-checking PayLio payment status in GET /api/payments/status:', checkErr);
      }
    }

    const isPayable =
      !['CANCELLED', 'REFUNDED'].includes(updatedBooking.status) &&
      updatedBooking.paymentStatus !== 'PAID';

    // Strictly limit returned fields to safe customer information
    return NextResponse.json({
      bookingNumber: updatedBooking.bookingNumber,
      bookingId: updatedBooking.id,
      status: updatedBooking.status,
      paymentStatus: updatedBooking.paymentStatus,
      paymentMethod: updatedBooking.paymentMethod,
      amount: updatedBooking.amount,
      serviceName: updatedBooking.service.name,
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
