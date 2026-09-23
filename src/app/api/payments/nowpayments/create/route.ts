import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { nowPaymentsClient } from '@/lib/nowpayments';
import { getCanonicalBaseUrl } from '@/app/api/payments/paylio/create/route';

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

    const booking = await db.booking.findFirst({
      where: bookingId ? { id: bookingId } : { bookingNumber },
      include: { customer: true, service: true },
    });

    if (!booking) {
      return NextResponse.json({ error: 'Booking record not found.' }, { status: 404 });
    }

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

    const baseUrl = getCanonicalBaseUrl(request);
    const callbackUrl = `${baseUrl}/api/payments/nowpayments/ipn`;
    const successUrl = `${baseUrl}/booking/success?id=${booking.id}`;
    const cancelUrl = `${baseUrl}/booking/success?id=${booking.id}&pay_error=1`;

    const invoice = await nowPaymentsClient.createInvoice({
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
      amount: booking.amount,
      customerEmail: booking.customer.email,
      callbackUrl,
      successUrl,
      cancelUrl,
    });

    await db.booking.update({
      where: { id: booking.id },
      data: {
        paymentMethod: 'CRYPTO',
        paymentReference: invoice.invoiceId,
        paymentStatus: 'PENDING',
      },
    });

    return NextResponse.json({
      success: true,
      invoiceUrl: invoice.invoiceUrl,
      invoiceId: invoice.invoiceId,
      bookingId: booking.id,
      bookingNumber: booking.bookingNumber,
    });
  } catch (err: unknown) {
    console.error('Error creating NOWPayments invoice:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create crypto invoice.' },
      { status: 502 }
    );
  }
}
