import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { paylioClient, confirmVerifiedPayLioPayment, PayLioPaymentStatusResult } from '@/lib/paylio';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-paylio-signature') || request.headers.get('paylio-signature');

    // 1. HMAC Webhook Signature Verification
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
    const paymentRef = (payload.payment_id || payload.id || payload.paymentReference) as string | undefined;
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
    let providerStatus: PayLioPaymentStatusResult['status'] = 'PENDING';
    let providerAmount: number | undefined;
    let providerCurrency: string | undefined;
    let providerMethod: 'CARD' | 'CRYPTO' | undefined;

    if (lookupRef) {
      const paylioStatus = await paylioClient.getPaymentStatus(lookupRef);
      providerStatus = paylioStatus.status;
      providerAmount = paylioStatus.amount;
      providerCurrency = paylioStatus.currency;
      providerMethod = paylioStatus.paymentMethod;
    } else {
      const rawPayloadStatus = String(payload.status || payload.event || '').toLowerCase();
      if (['paid', 'completed', 'succeeded', 'payment.succeeded'].includes(rawPayloadStatus)) {
        providerStatus = 'PAID';
      } else if (['failed', 'declined', 'payment.failed'].includes(rawPayloadStatus)) {
        providerStatus = 'FAILED';
      }
    }

    // 5. Centralized Payment Transition Function
    const transitionResult = await confirmVerifiedPayLioPayment({
      bookingId: booking.id,
      paymentReference: lookupRef || booking.paymentReference || '',
      providerStatus,
      providerAmount,
      providerCurrency,
      providerMethod,
    });

    if (!transitionResult.success && providerStatus !== 'FAILED') {
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
    console.error('Error processing PayLio webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error while processing webhook' },
      { status: 500 }
    );
  }
}
