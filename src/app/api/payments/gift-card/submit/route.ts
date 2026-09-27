import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/notifications/telegram';
import { formatUtcDateString, formatUtcTimeString } from '@/lib/timezone';
import { uploadToR2, generateGiftCardObjectKey, deleteFromR2 } from '@/lib/r2';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per file
const MAX_FILE_COUNT = 5;

function validateImageMagicBytes(buffer: Buffer): { valid: boolean; format?: string } {
  if (buffer.length < 8) return { valid: false };

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, format: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, format: 'image/png' };
  }

  // WebP: RIFF ... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, format: 'image/webp' };
  }

  return { valid: false };
}

export async function POST(request: Request) {
  try {
    let bookingId: string | null = null;
    let cardType: string | null = null;
    let cardCode: string | null = null;
    let declaredValueRaw: string | null = null;
    let notes: string | null = null;
    let email: string | null = null;
    const uploadedFiles: { fileBuffer: Buffer; mimeType: string; extension: string }[] = [];

    const contentTypeHeader = request.headers.get('content-type') || '';

    if (contentTypeHeader.includes('multipart/form-data')) {
      const formData = await request.formData();
      bookingId = formData.get('bookingId') as string | null;
      cardType = formData.get('cardType') as string | null;
      cardCode = formData.get('cardCode') as string | null;
      declaredValueRaw = formData.get('declaredValue') as string | null;
      notes = formData.get('notes') as string | null;
      email = formData.get('email') as string | null;

      const fileEntries = formData.getAll('images');
      if (fileEntries.length > MAX_FILE_COUNT) {
        return NextResponse.json(
          { error: `Maximum of ${MAX_FILE_COUNT} gift card photos permitted per submission.` },
          { status: 400 }
        );
      }

      for (const entry of fileEntries) {
        if (entry && typeof entry === 'object' && 'arrayBuffer' in entry) {
          const file = entry as File;
          if (file.size > 0) {
            if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
              return NextResponse.json(
                { error: `Invalid image type (${file.type}). Only JPEG, PNG, and WebP images are allowed.` },
                { status: 400 }
              );
            }
            if (file.size > MAX_FILE_SIZE_BYTES) {
              return NextResponse.json(
                { error: `Image file "${file.name}" exceeds the maximum size limit of 10MB.` },
                { status: 400 }
              );
            }
            const buffer = Buffer.from(await file.arrayBuffer());
            const magicCheck = validateImageMagicBytes(buffer);
            if (!magicCheck.valid) {
              return NextResponse.json(
                { error: `File content for "${file.name}" does not match a valid JPEG, PNG, or WebP image.` },
                { status: 400 }
              );
            }
            const ext = magicCheck.format === 'image/png' ? 'png' : magicCheck.format === 'image/webp' ? 'webp' : 'jpg';
            uploadedFiles.push({ fileBuffer: buffer, mimeType: magicCheck.format || file.type, extension: ext });
          }
        }
      }
    } else {
      const body = await request.json();
      bookingId = body.bookingId;
      cardType = body.cardType;
      cardCode = body.cardCode;
      declaredValueRaw = body.declaredValue;
      notes = body.notes;
      email = body.email;
    }

    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID is required.' }, { status: 400 });
    }

    if (!cardType || typeof cardType !== 'string' || cardType.trim().length < 2) {
      return NextResponse.json({ error: 'Gift card brand or type is required.' }, { status: 400 });
    }

    if (!cardCode || typeof cardCode !== 'string' || cardCode.trim().length < 4) {
      return NextResponse.json({ error: 'Gift card number or claim code is required.' }, { status: 400 });
    }

    const numericValue = Number(declaredValueRaw);
    if (isNaN(numericValue) || numericValue <= 0) {
      return NextResponse.json({ error: 'Gift card declared value must be a positive amount.' }, { status: 400 });
    }

    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: { customer: true, service: true, giftCardSubmission: { include: { images: true } } },
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

    // Require at least one photo upload
    if (uploadedFiles.length === 0) {
      return NextResponse.json(
        { error: 'At least one clear photo of the gift card (front/back or claim code/PIN) is required.' },
        { status: 400 }
      );
    }

    // Access control check: Verify authenticated customer owner, admin session, or guest with a valid checkout capability token
    const cookieHeader = request.headers.get('cookie') || undefined;
    const { getVerifiedCustomerSession, getVerifiedAdminSession, extractCheckoutToken, verifyCheckoutToken } = await import('@/lib/auth-session');
    const customerSession = await getVerifiedCustomerSession(cookieHeader);
    const adminSession = await getVerifiedAdminSession(cookieHeader);
    const token = extractCheckoutToken(request, { bookingId, email });

    const isCustomerOwner = Boolean(customerSession && customerSession.entityId === booking.customerId);
    const isAdmin = Boolean(adminSession);
    const hasValidCheckoutToken = Boolean(token && verifyCheckoutToken(token, booking.id));

    if (!isCustomerOwner && !isAdmin && !hasValidCheckoutToken) {
      return NextResponse.json(
        { error: 'Unauthorized: You do not have permission to submit payment for this booking.' },
        { status: 403 }
      );
    }

    // Clean up previous submission images if resubmitting
    if (booking.giftCardSubmission && booking.giftCardSubmission.images.length > 0) {
      for (const oldImg of booking.giftCardSubmission.images) {
        try {
          await deleteFromR2(oldImg.storageKey);
        } catch (delErr) {
          console.warn('Failed to delete old gift card image from R2:', delErr);
        }
      }
    }

    // Upload new image buffers to Cloudflare R2 and generate private storage keys
    const createdStorageKeys: string[] = [];
    for (const fileObj of uploadedFiles) {
      const storageKey = generateGiftCardObjectKey(booking.id, fileObj.extension);
      await uploadToR2({
        fileBuffer: fileObj.fileBuffer,
        contentType: fileObj.mimeType,
        key: storageKey,
      });
      createdStorageKeys.push(storageKey);
    }

    // Upsert GiftCardSubmission record & GiftCardImage records atomically
    const submission = await db.$transaction(async (tx) => {
      // Delete existing GiftCardImage records for this submission if present
      if (booking.giftCardSubmission) {
        await tx.giftCardImage.deleteMany({
          where: { giftCardSubmissionId: booking.giftCardSubmission.id },
        });
      }

      const sub = await tx.giftCardSubmission.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          cardType: cardType!.trim(),
          cardCode: cardCode!.trim(),
          declaredValue: numericValue,
          notes: notes ? String(notes).trim() : null,
          status: 'PENDING',
          images: {
            create: createdStorageKeys.map((key) => ({ storageKey: key })),
          },
        },
        update: {
          cardType: cardType!.trim(),
          cardCode: cardCode!.trim(),
          declaredValue: numericValue,
          notes: notes ? String(notes).trim() : null,
          status: 'PENDING',
          rejectionReason: null,
          images: {
            create: createdStorageKeys.map((key) => ({ storageKey: key })),
          },
        },
      });

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          paymentMethod: 'GIFT_CARD',
          paymentReference: sub.id,
          paymentStatus: 'PENDING',
        },
      });

      return sub;
    });

    try {
      const { createAdminNotification } = await import('@/lib/admin-notifications');
      await createAdminNotification({
        type: 'GIFT_CARD_SUBMITTED',
        title: 'New Gift Card Submitted for Review',
        message: `Gift card submitted for booking ${booking.bookingNumber}`,
        link: '/admin/payments',
      });
    } catch (notifErr) {
      console.error('Error creating admin notification for gift card submission:', notifErr);
    }

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
