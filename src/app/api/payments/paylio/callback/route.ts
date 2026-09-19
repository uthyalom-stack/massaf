import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { paylioClient, confirmVerifiedPayLioPayment } from '@/lib/paylio';

/**
 * PayLio GET Callback Route
 * PayLio performs a GET request to this callback URL after payment attempt.
 * Query string parameters are UNTRUSTED and must be verified server-to-server.
 */
export async function GET(request: Request) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const { searchParams } = new URL(request.url);
    const bookingIdParam = searchParams.get('bookingId');
    const ipnTokenParam = searchParams.get('ipn_token') || searchParams.get('token');

    if (!bookingIdParam && !ipnTokenParam) {
      return NextResponse.redirect(`${baseUrl}/booking/success?pay_error=missing_ref`);
    }

    // Identify booking
    const orConditions: Array<{ id?: string; paymentReference?: string }> = [];
    if (bookingIdParam) orConditions.push({ id: bookingIdParam });
    if (ipnTokenParam) orConditions.push({ paymentReference: ipnTokenParam });

    const booking = await db.booking.findFirst({
      where: {
        OR: orConditions,
      },
    });

    if (!booking) {
      return NextResponse.redirect(`${baseUrl}/booking/success?pay_error=not_found`);
    }

    const targetToken = ipnTokenParam || booking.paymentReference;

    if (targetToken) {
      // Direct server-to-server status verification
      const paylioStatus = await paylioClient.getPaymentStatus(targetToken);

      if (paylioStatus.status !== 'PENDING' && paylioStatus.status !== 'UNKNOWN') {
        await confirmVerifiedPayLioPayment({
          bookingId: booking.id,
          ipnToken: targetToken,
          providerStatus: paylioStatus.status,
          providerOriginalAmount: paylioStatus.originalAmount,
          providerCurrency: paylioStatus.currency,
          providerMethod: paylioStatus.paymentMethod,
        });
      }
    }

    // Redirect customer safely to confirmation success page
    return NextResponse.redirect(`${baseUrl}/booking/success?id=${booking.id}`);
  } catch (error) {
    console.error('Error in PayLio callback endpoint:', error);
    return NextResponse.redirect(`${baseUrl}/booking/success?pay_error=server_error`);
  }
}
