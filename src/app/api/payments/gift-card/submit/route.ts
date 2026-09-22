import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/notifications/telegram';
import { formatUtcDateString, formatUtcTimeString } from '@/lib/timezone';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { bookingId, cardType, cardCode, declaredValue, notes } = body;

    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID is required.' }, { status: 400 });
    }

    if (!cardType || typeof cardType !== 'string' || cardType.trim().length < 2) {
      return NextResponse.json({ error: 'Gift card brand or type is required.' }, { status: 400 });
    }

    if (!cardCode || typeof cardCode !== 'string' || cardCode.trim().length < 4) {
      return NextResponse.json({ error: 'Gift card number or claim code is required.' }, { status: 400 });
    }

    const numericValue = Number(declaredValue);
    if (isNaN(numericValue) || numericValue <= 0) {
      return NextResponse.json({ error: 'Gift card declared value must be a positive amount.' }, { status: 400 });
    }

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: { customer: true, service: true },
    });

    if (!booking) {
      return NextResponse.json({ error: 'Booking record not found.' }, { status: 404 });
    }

    if (['CANCELLED', 'REFUNDED'].includes(booking.status)) {
      return NextResponse.json(
        { error: 'Cannot submit payment for a cancelled or refunded booking.' },
        { status: 400 }
      );
    }

    if (booking.paymentStatus === 'PAID') {
      return NextResponse.json(
        { error: 'This booking has already been paid.' },
        { status: 400 }
      );
    }

    // Upsert GiftCardSubmission record
    const submission = await db.giftCardSubmission.upsert({
      where: { bookingId: booking.id },
      create: {
        bookingId: booking.id,
        cardType: cardType.trim(),
        cardCode: cardCode.trim(),
        declaredValue: numericValue,
        notes: notes ? String(notes).trim() : null,
        status: 'PENDING',
      },
      update: {
        cardType: cardType.trim(),
        cardCode: cardCode.trim(),
        declaredValue: numericValue,
        notes: notes ? String(notes).trim() : null,
        status: 'PENDING',
        rejectionReason: null,
      },
    });

    // Update booking payment method to GIFT_CARD and reference
    await db.booking.update({
      where: { id: booking.id },
      data: {
        paymentMethod: 'GIFT_CARD',
        paymentReference: submission.id,
        paymentStatus: 'PENDING',
      },
    });

    // Send Telegram Notification to Admin Destination
    const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
    if (adminChatId) {
      try {
        const formattedDate = formatUtcDateString(booking.appointmentDateTime);
        const formattedTime = formatUtcTimeString(booking.appointmentDateTime);
        const tgMsg = `MASSAF — Gift Card Payment Submitted

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name} (${booking.customer.email})
Service: ${booking.service.name} ($${booking.amount.toFixed(2)})
Date: ${formattedDate} at ${formattedTime}
Gift Card Type: ${cardType.trim()}
Declared Value: $${numericValue.toFixed(2)}
Submitted: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC

Review this submission in the MASSAF admin dashboard.`;

        await sendTelegramMessage({
          chatId: adminChatId,
          message: tgMsg,
        });
      } catch (tgErr) {
        console.error('Failed to dispatch gift card admin Telegram notification:', tgErr);
      }
    }

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
      bookingId: booking.id,
      redirectUrl: `/booking/success?id=${booking.id}&gift_card=1`,
    });
  } catch (err: unknown) {
    console.error('Error in gift card submission:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to submit gift card details.' },
      { status: 500 }
    );
  }
}
