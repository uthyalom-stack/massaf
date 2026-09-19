import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { paylioClient, confirmVerifiedPayLioPayment } from '@/lib/paylio';

/**
 * PayLio GET Callback Route
 * PayLio performs a GET request to this callback URL after a payment attempt.
 * Parameters from query string are UNTRUSTED and verified server-to-server.
 * Returns HTTP 200/400/500 JSON response directly to PayLio provider request.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bookingIdParam = searchParams.get('bookingId');
    const ipnTokenParam = searchParams.get('ipn_token') || searchParams.get('token');

    // 1. Require PayLio ipn_token parameter
    if (!ipnTokenParam || ipnTokenParam.trim().length === 0) {
      console.warn('[SECURITY WARNING] PayLio callback received without required ipn_token parameter');
      return NextResponse.json(
        { error: 'Missing required ipn_token parameter in callback' },
        { status: 400 }
      );
    }

    const suppliedToken = ipnTokenParam.trim();

    // 2. Identify booking
    let booking = null;
    if (bookingIdParam) {
      booking = await db.booking.findUnique({
        where: { id: bookingIdParam },
      });
    } else {
      booking = await db.booking.findFirst({
        where: { paymentReference: suppliedToken },
      });
    }

    if (!booking) {
      console.warn('PayLio callback received for non-existent booking:', { bookingIdParam, suppliedToken });
      return NextResponse.json(
        { error: 'Booking record not found' },
        { status: 404 }
      );
    }

    // 3. Strict Token Ownership Guard: booking.paymentReference MUST equal supplied ipn_token
    if (!booking.paymentReference || booking.paymentReference !== suppliedToken) {
      console.warn(`[SECURITY WARNING] Token ownership mismatch in callback for booking ${booking.bookingNumber}. Stored token: "${booking.paymentReference}", Supplied token: "${suppliedToken}"`);
      return NextResponse.json(
        { error: 'Supplied ipn_token does not match payment reference stored on booking' },
        { status: 400 }
      );
    }

    // 4. Idempotency Check: If already marked PAID, return 200 OK immediately
    if (booking.paymentStatus === 'PAID') {
      return NextResponse.json({
        message: 'Callback processed idempotently (booking already PAID)',
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
      });
    }

    // 5. Server-to-Server PayLio Status Verification (Zero Trust in Callback Query String)
    const paylioStatus = await paylioClient.getPaymentStatus(suppliedToken);

    if (paylioStatus.status === 'UNKNOWN') {
      return NextResponse.json(
        { error: 'Failed to verify payment status with PayLio provider' },
        { status: 502 }
      );
    }

    // 6. Centralized Payment Transition Function
    const transitionResult = await confirmVerifiedPayLioPayment({
      bookingId: booking.id,
      ipnToken: suppliedToken,
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
