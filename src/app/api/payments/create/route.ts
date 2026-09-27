import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { PaymentService } from '@/lib/payments/service';
import { PaymentProviderId } from '@/lib/payments/types';
import { getVerifiedCustomerSession, extractCheckoutToken, verifyCheckoutToken } from '@/lib/auth-session';
import { getCanonicalBaseUrl } from '@/app/api/payments/paylio/create/route';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { bookingId, bookingNumber, providerId: rawProviderId } = body;

    if (!bookingId && !bookingNumber) {
      return NextResponse.json(
        { error: 'Booking identifier is required.' },
        { status: 400 }
      );
    }

    // 1. Fetch booking strictly from database using server authority
    const booking = await db.booking.findFirst({
      where: bookingId ? { id: bookingId } : { bookingNumber },
      include: {
        service: true,
        customer: true,
      },
    });

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking record not found.' },
        { status: 404 }
      );
    }

    // 2. Server-side Authorization Check
    const cookieHeader = request.headers.get('cookie') || undefined;
    const customerSession = await getVerifiedCustomerSession(cookieHeader);
    const token = extractCheckoutToken(request, body);
    const isOwner = Boolean(customerSession && customerSession.entityId === booking.customerId);
    const hasValidToken = Boolean(token && verifyCheckoutToken(token, booking.id));

    if (!isOwner && !hasValidToken) {
      return NextResponse.json(
        { error: 'Unauthorized: You do not have permission to pay for this booking.' },
        { status: 403 }
      );
    }

    // 3. Validate booking eligibility
    if (['CANCELLED', 'REFUNDED'].includes(booking.status)) {
      return NextResponse.json(
        { error: 'This booking has been cancelled or refunded and cannot be paid.' },
        { status: 400 }
      );
    }

    if (booking.paymentStatus === 'PAID') {
      return NextResponse.json(
        { error: 'This booking has already been paid.' },
        { status: 400 }
      );
    }

    if (!booking.amount || booking.amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid booking payment amount.' },
        { status: 400 }
      );
    }

    // 4. Resolve payment provider via PaymentService and System Settings
    const settings = await PaymentService.getSettings();
    const targetProviderId: PaymentProviderId = rawProviderId
      ? (rawProviderId as PaymentProviderId)
      : settings.defaultProviderId;

    const providerSetting = settings.providers[targetProviderId];
    if (!providerSetting || !providerSetting.enabled) {
      return NextResponse.json(
        { error: `Payment provider '${targetProviderId}' is currently disabled or unavailable.` },
        { status: 400 }
      );
    }

    const adapter = PaymentService.getAdapter(targetProviderId);
    if (!adapter) {
      return NextResponse.json(
        { error: `Payment provider '${targetProviderId}' is not supported.` },
        { status: 400 }
      );
    }

    if (!adapter.isImplemented()) {
      return NextResponse.json(
        { error: `Payment provider '${adapter.name}' is architected but not currently implemented.` },
        { status: 400 }
      );
    }

    if (!adapter.isConfigured()) {
      return NextResponse.json(
        { error: `Payment provider '${adapter.name}' is not fully configured on the server.` },
        { status: 400 }
      );
    }

    // 5. Construct callback / return URLs
    const baseUrl = getCanonicalBaseUrl(request);
    const tokenQueryParam = token ? `&token=${encodeURIComponent(token)}` : '';
    const callbackUrl = targetProviderId === 'nowpayments'
      ? `${baseUrl}/api/payments/nowpayments/ipn`
      : `${baseUrl}/api/payments/webhook/${targetProviderId}?bookingId=${booking.id}${tokenQueryParam}`;
    const successUrl = `${baseUrl}/booking/success?id=${booking.id}${tokenQueryParam}`;
    const cancelUrl = `${baseUrl}/booking/success?id=${booking.id}&pay_error=1${tokenQueryParam}`;

    // 6. Invoke adapter with server-authoritative booking amount
    const creationResult = await adapter.createPayment({
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      amount: booking.amount, // Derived strictly from server database record
      currency: 'USD',
      customerEmail: booking.customer.email,
      customerName: booking.customer.name,
      callbackUrl,
      successUrl,
      cancelUrl,
      checkoutToken: token || undefined,
    });

    if (!creationResult.success) {
      return NextResponse.json(
        { error: creationResult.error || `Failed to create payment session with ${adapter.name}.` },
        { status: 502 }
      );
    }

    // Update payment reference on booking
    if (creationResult.providerPaymentId) {
      const updateData: Record<string, unknown> = {
        paymentReference: creationResult.providerPaymentId,
        paymentStatus: 'PENDING',
      };
      if (targetProviderId === 'nowpayments') {
        updateData.paymentMethod = 'CRYPTO';
      }
      await db.booking.update({
        where: { id: booking.id },
        data: updateData,
      });
    }

    return NextResponse.json({
      success: true,
      providerId: targetProviderId,
      checkoutUrl: creationResult.checkoutUrl,
      providerPaymentId: creationResult.providerPaymentId,
      instructions: creationResult.instructions,
      bookingNumber: booking.bookingNumber,
      bookingId: booking.id,
    });
  } catch (error) {
    console.error('Unexpected error in /api/payments/create endpoint:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while creating payment session.' },
      { status: 500 }
    );
  }
}
