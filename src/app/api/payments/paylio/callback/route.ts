import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { paylioClient, confirmVerifiedPayLioPayment } from '@/lib/paylio';

/**
 * PayLio GET Callback Route
 * PayLio performs a GET request to this callback URL after a payment attempt.
 * Parameters from query string are UNTRUSTED and verified server-to-server.
 * Returns HTTP 200/400/500 JSON response to PayLio provider request.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bookingIdParam = searchParams.get('bookingId');
    const ipnTokenParam = searchParams.get('ipn_token') || searchParams.get('token');

    if (!bookingIdParam && !ipnTokenParam) {
      return NextResponse.json(
        { error: 'Missing bookingId or ipn_token parameter in callback' },
        { status: 400 }
      );
    }

    // 1. Identify booking
    const orConditions: Array<{ id?: string; paymentReference?: string }> = [];
    if (bookingIdParam) orConditions.push({ id: bookingIdParam });
    if (ipnTokenParam) orConditions.push({ paymentReference: ipnTokenParam });

    const booking = await db.booking.findFirst({
      where: {
        OR: orConditions,
      },
    });

    if (!booking) {
      console.warn('PayLio callback received for non-existent booking:', { bookingIdParam, ipnTokenParam });
      return NextResponse.json(
        { error: 'Booking record not found' },
        { status: 404 }
      );
    }

    const targetToken = ipnTokenParam || booking.paymentReference;

    if (!targetToken) {
      return NextResponse.json(
        { error: 'No ipn_token associated with this booking' },
        { status: 400 }
      );
    }

    // 2. Token Ownership Enforcement
    if (booking.paymentReference && booking.paymentReference !== targetToken) {
      console.warn(`[SECURITY WARNING] PayLio callback token mismatch for booking ${booking.bookingNumber}. Stored: "${booking.paymentReference}", Supplied: "${targetToken}"`);
      return NextResponse.json(
        { error: 'Supplied ipn_token does not match payment reference stored on booking' },
        { status: 400 }
      );
    }

    // 3. Idempotency Check
    if (booking.paymentStatus === 'PAID') {
      return NextResponse.json({
        message: 'Callback processed idempotently (booking already PAID)',
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
      });
    }

    // 4. Server-to-Server PayLio Status Verification
    const paylioStatus = await paylioClient.getPaymentStatus(targetToken);

    if (paylioStatus.status === 'UNKNOWN') {
      return NextResponse.json(
        { error: 'Failed to verify payment status with PayLio provider' },
        { status: 502 }
      );
    }

    // 5. Centralized Payment Transition
    const transitionResult = await confirmVerifiedPayLioPayment({
      bookingId: booking.id,
      ipnToken: targetToken,
      providerStatus: paylioStatus.status,
      providerOriginalAmount: paylioStatus.originalAmount,
      providerCurrency: paylioStatus.currency,
      providerMethod: paylioStatus.paymentMethod,
    });

    if (!transitionResult.success && paylioStatus.status !== 'FAILED') {
      return NextResponse.json(
        { error: transitionResult.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: transitionResult.message,
      bookingNumber: booking.bookingNumber,
      status: transitionResult.bookingStatus,
      paymentStatus: transitionResult.paymentStatus,
    });
  } catch (error) {
    console.error('Error in PayLio GET callback route:', error);
    return NextResponse.json(
      { error: 'Internal server error processing PayLio callback' },
      { status: 500 }
    );
  }
}
