import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { paylioClient } from '@/lib/paylio';
import { getVerifiedCustomerSession, extractCheckoutToken, verifyCheckoutToken } from '@/lib/auth-session';

export function getCanonicalBaseUrl(request?: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL;
  if (envUrl && envUrl.trim()) {
    let clean = envUrl.trim().replace(/^["\x27]|["\x27]$/g, '').replace(/\/$/, '');
    if (process.env.NODE_ENV === 'production' && !clean.startsWith('https://')) {
      clean = clean.replace(/^http:\/\//, 'https://');
      if (!clean.startsWith('https://')) {
        clean = `https://${clean}`;
      }
    }
    return clean;
  }

  if (process.env.VERCEL_URL) {
    const vercelHost = process.env.VERCEL_URL.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `https://${vercelHost}`;
  }

  if (request) {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
    if (host) {
      const effectiveProto = process.env.NODE_ENV === 'production' ? 'https' : proto;
      return `${effectiveProto}://${host}`;
    }
  }

  return process.env.NODE_ENV === 'production' ? 'https://massaf.com' : 'http://localhost:3000';
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { bookingId, bookingNumber } = body;

    if (!bookingId && !bookingNumber) {
      return NextResponse.json(
        { error: 'Booking identifier is required.' },
        { status: 400 }
      );
    }

    // 1. Fetch booking strictly from database using server authority
    const booking = await db.booking.findFirst({
      where: bookingId
        ? { id: bookingId }
        : { bookingNumber: bookingNumber },
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

    // 1b. Server-side Authorization Check
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

    // 2. Validate eligibility
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

    // 3. Construct application PayLio callback URL
    const baseUrl = getCanonicalBaseUrl(request);
    const tokenQueryParam = token ? `&token=${encodeURIComponent(token)}` : '';
    const callbackUrl = `${baseUrl}/api/payments/paylio/callback?bookingId=${booking.id}${tokenQueryParam}`;

    // 4. Create PayLio wallet checkout link
    try {
      const walletPayment = await paylioClient.createWalletPayment({
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        amount: booking.amount, // Derived strictly from server database record
        customerEmail: booking.customer.email,
        callbackUrl,
        notes: `MASSAF Booking ${booking.bookingNumber}`,
      });

      // 5. Store PayLio ipn_token as paymentReference in DB without setting premature paymentMethod
      await db.booking.update({
        where: { id: booking.id },
        data: {
          paymentReference: walletPayment.ipnToken,
          paymentStatus: 'PENDING',
        },
      });

      return NextResponse.json({
        success: true,
        checkoutUrl: walletPayment.checkoutUrl,
        ipnToken: walletPayment.ipnToken,
        paymentReference: walletPayment.ipnToken,
        bookingNumber: booking.bookingNumber,
        bookingId: booking.id,
      });
    } catch (err) {
      console.error('Error initiating PayLio wallet checkout:', err);
      return NextResponse.json(
        { error: 'Failed to initiate checkout session with payment provider. Please try again.' },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('Unexpected error in PayLio create payment endpoint:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred while setting up payment.' },
      { status: 500 }
    );
  }
}
