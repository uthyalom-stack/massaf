import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { paylioClient } from '@/lib/paylio';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-paylio-signature') || request.headers.get('paylio-signature');

    // 1. HMAC Webhook Signature Verification
    // Skip verification only in test environment if configured
    const skipVerification = process.env.NODE_ENV === 'test' && process.env.PAYLIO_SKIP_SIGNATURE_VERIFY === 'true';
    if (!skipVerification && !paylioClient.verifyWebhookSignature(rawBody, signature)) {
      console.warn('Invalid PayLio webhook signature received');
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Malformed JSON payload' },
        { status: 400 }
      );
    }

    // Extract identifiers from webhook event
    const paymentRef = (payload.payment_id || payload.paymentId || payload.id || payload.paymentReference) as string | undefined;
    const bookingNumber = (payload.reference || payload.booking_number || payload.bookingNumber) as string | undefined;
    const bookingId = (payload.booking_id || payload.bookingId) as string | undefined;

    if (!paymentRef && !bookingNumber && !bookingId) {
      return NextResponse.json(
        { error: 'Missing payment or booking reference in webhook payload' },
        { status: 400 }
      );
    }

    // 2. Identify the booking record
    const orConditions: Array<{ paymentReference?: string; id?: string; bookingNumber?: string }> = [];
    if (paymentRef) orConditions.push({ paymentReference: paymentRef });
    if (bookingId) orConditions.push({ id: bookingId });
    if (bookingNumber) orConditions.push({ bookingNumber });

    const booking = await db.booking.findFirst({
      where: {
        OR: orConditions,
      },
    });

    if (!booking) {
      console.warn('PayLio webhook received for non-existent booking:', { paymentRef, bookingNumber, bookingId });
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // 3. Idempotency Check: If already PAID, return 200 OK immediately without duplicate side effects
    if (booking.paymentStatus === 'PAID') {
      return NextResponse.json({
        message: 'Webhook processed idempotently (booking already PAID)',
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
      });
    }

    // 4. Server-Side Direct PayLio Status Re-check (Zero Trust in Raw Webhook Body)
    const lookupRef = paymentRef || booking.paymentReference;
    let verifiedPaymentStatus = 'PENDING';
    let paymentMethodDetected: 'CARD' | 'CRYPTO' = 'CARD';

    if (lookupRef) {
      const paylioStatus = await paylioClient.getPaymentStatus(lookupRef);
      verifiedPaymentStatus = paylioStatus.status;
      if (paylioStatus.transactionHash) {
        paymentMethodDetected = 'CRYPTO';
      }
    } else {
      // Fallback to payload status mapping if lookupRef unavailable
      const rawPayloadStatus = String(payload.status || payload.event || '').toLowerCase();
      if (['paid', 'completed', 'succeeded', 'payment.succeeded'].includes(rawPayloadStatus)) {
        verifiedPaymentStatus = 'PAID';
      } else if (['failed', 'declined', 'payment.failed'].includes(rawPayloadStatus)) {
        verifiedPaymentStatus = 'FAILED';
      }
    }

    // 5. Update Database State Idempotently
    if (verifiedPaymentStatus === 'PAID') {
      await db.booking.update({
        where: { id: booking.id },
        data: {
          paymentStatus: 'PAID',
          paymentMethod: paymentMethodDetected,
          paymentReference: lookupRef || booking.paymentReference,
          status: booking.status === 'PENDING' ? 'CONFIRMED' : booking.status,
        },
      });

      return NextResponse.json({
        message: 'Payment verified and booking updated to PAID/CONFIRMED',
        bookingNumber: booking.bookingNumber,
        paymentStatus: 'PAID',
      });
    } else if (verifiedPaymentStatus === 'FAILED' || verifiedPaymentStatus === 'EXPIRED') {
      await db.booking.update({
        where: { id: booking.id },
        data: {
          paymentStatus: 'FAILED',
          paymentReference: lookupRef || booking.paymentReference,
        },
      });

      return NextResponse.json({
        message: `Payment status updated to ${verifiedPaymentStatus}`,
        bookingNumber: booking.bookingNumber,
        paymentStatus: 'FAILED',
      });
    }

    return NextResponse.json({
      message: 'Webhook received. Payment status remains pending.',
      bookingNumber: booking.bookingNumber,
      paymentStatus: booking.paymentStatus,
    });
  } catch (error) {
    console.error('Error processing PayLio webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error while processing webhook' },
      { status: 500 }
    );
  }
}
