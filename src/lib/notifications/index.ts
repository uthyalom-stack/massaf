import { db } from '@/lib/db';
import { sendEmail } from './email';
import { sendTelegramMessage } from './telegram';
import { formatUtcDateString, formatUtcTimeString } from '@/lib/timezone';

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function getAdminChatId(): string | undefined {
  return process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
}

/**
 * Helper to retrieve full booking data with customer, therapist, and service relations
 */
async function getBookingWithDetails(bookingId: string) {
  return db.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: true,
      therapist: true,
      service: true,
    },
  });
}

/**
 * 1. CUSTOMER BOOKING CREATED NOTIFICATION
 * Called when a new booking is submitted (status=PENDING, paymentStatus=UNPAID).
 * States "Payment Pending" and provides payment instructions.
 */
export async function notifyBookingCreated(bookingId: string): Promise<void> {
  try {
    const booking = await getBookingWithDetails(bookingId);
    if (!booking || !booking.customer) return;

    const formattedDate = formatUtcDateString(booking.appointmentDateTime);
    const formattedTime = formatUtcTimeString(booking.appointmentDateTime);
    const appUrl = getAppUrl();
    const paymentUrl = `${appUrl}/booking/success?id=${booking.id}`;

    const subject = `MASSAF Booking Received — Payment Pending (${booking.bookingNumber})`;
    const text = `Hello ${booking.customer.name},

Thank you for choosing MASSAF! We have received your booking request.

Booking Reference: ${booking.bookingNumber}
Service: ${booking.service.name} (${booking.durationMinutes} mins)
Therapist: ${booking.therapist ? booking.therapist.name : 'Auto-Matching'}
Date: ${formattedDate}
Time: ${formattedTime}
Appointment Type: ${booking.locationType === 'STUDIO' ? 'Studio Session' : 'In-Home Session'}
Amount: $${booking.amount.toFixed(2)}
Booking Status: PENDING
Payment Status: UNPAID (Payment Pending)

NEXT ACTION / PAYMENT INSTRUCTION:
Your appointment reservation is currently pending payment. To complete your booking, please finalize payment using PayLio at:
${paymentUrl}

Please note: Unpaid bookings are automatically cancelled after 30 minutes.

Warm regards,
MASSAF Team
${appUrl}`;

    await sendEmail({
      to: booking.customer.email,
      subject,
      text,
    });
  } catch (error) {
    console.error('[Notification Isolation] notifyBookingCreated error:', error);
  }
}

/**
 * 2. PAYMENT CONFIRMATION NOTIFICATION
 * Called when server verifies payment (paymentStatus=PAID, status=CONFIRMED).
 * Sends confirmation email to Customer, operational notification to Therapist (Telegram if telegramChatId set, else Email) and Admin (Telegram).
 */
export async function notifyBookingConfirmed(bookingId: string): Promise<void> {
  try {
    const booking = await getBookingWithDetails(bookingId);
    if (!booking || !booking.customer) return;

    const formattedDate = formatUtcDateString(booking.appointmentDateTime);
    const formattedTime = formatUtcTimeString(booking.appointmentDateTime);
    const appUrl = getAppUrl();
    const bookingUrl = `${appUrl}/booking/success?id=${booking.id}`;

    // Customer Notification
    const customerSubject = `MASSAF Booking Confirmed — ${booking.bookingNumber}`;
    const customerText = `Hello ${booking.customer.name},

Great news! Your payment has been verified and your booking is now CONFIRMED.

Booking Reference: ${booking.bookingNumber}
Service: ${booking.service.name} (${booking.durationMinutes} mins)
Therapist: ${booking.therapist ? booking.therapist.name : 'Assigned Specialist'}
Date: ${formattedDate}
Time: ${formattedTime}
Appointment Type: ${booking.locationType === 'STUDIO' ? 'Studio Session' : 'In-Home Session'}
${booking.locationType === 'IN_HOME' && booking.addressLine1 ? `Location: ${booking.addressLine1}, ${booking.city || ''}, ${booking.state || ''} ${booking.zipCode || ''}` : ''}
Amount Paid: $${booking.amount.toFixed(2)}
Payment Status: PAID

View your booking details:
${bookingUrl}

We look forward to seeing you!

Warm regards,
MASSAF Team`;

    await sendEmail({
      to: booking.customer.email,
      subject: customerSubject,
      text: customerText,
    });

    // Therapist Operational Notification
    if (booking.therapist) {
      if (booking.therapist.telegramChatId) {
        // Therapist has explicit Telegram configuration: send directly to therapist's Telegram chat
        const therapistTelegramMsg = `MASSAF — NEW CONFIRMED BOOKING

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name} (${booking.durationMinutes} mins)
Date: ${formattedDate}
Time: ${formattedTime}
Type: ${booking.locationType === 'STUDIO' ? 'Studio' : 'In-Home'}
${booking.locationType === 'IN_HOME' && booking.addressLine1 ? `Location: ${booking.addressLine1}, ${booking.city || ''}, ${booking.state || ''}` : ''}
Amount: $${booking.amount.toFixed(2)}`;

        await sendTelegramMessage({
          chatId: booking.therapist.telegramChatId,
          message: therapistTelegramMsg,
        });
      } else if (booking.therapist.email) {
        // Fall back to therapist's email if no telegramChatId is set (NEVER fall back to admin Telegram chat)
        await sendEmail({
          to: booking.therapist.email,
          subject: `NEW CONFIRMED BOOKING — ${booking.bookingNumber}`,
          text: `Hello ${booking.therapist.name},

You have a new confirmed appointment!

Booking Ref: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name} (${booking.durationMinutes} mins)
Date: ${formattedDate}
Time: ${formattedTime}
Type: ${booking.locationType}
${booking.locationType === 'IN_HOME' && booking.addressLine1 ? `Address: ${booking.addressLine1}, ${booking.city || ''}` : ''}
Amount: $${booking.amount.toFixed(2)}`,
        });
      }
    }

    // Admin Telegram Notification
    const adminChatId = getAdminChatId();
    if (adminChatId) {
      const adminTelegramMsg = `NEW CONFIRMED BOOKING

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name}
Date: ${formattedDate}
Time: ${formattedTime}
Therapist: ${booking.therapist ? booking.therapist.name : 'Unassigned'}
Amount: $${booking.amount.toFixed(2)}`;

      await sendTelegramMessage({
        chatId: adminChatId,
        message: adminTelegramMsg,
      });
    }
  } catch (error) {
    console.error('[Notification Isolation] notifyBookingConfirmed error:', error);
  }
}

/**
 * 3. CANCELLATION NOTIFICATION
 * Called when a booking transitions to CANCELLED status.
 */
export async function notifyBookingCancelled(bookingId: string, reason?: string): Promise<void> {
  try {
    const booking = await getBookingWithDetails(bookingId);
    if (!booking || !booking.customer) return;

    const formattedDate = formatUtcDateString(booking.appointmentDateTime);
    const formattedTime = formatUtcTimeString(booking.appointmentDateTime);
    const appUrl = getAppUrl();

    // Customer Email
    await sendEmail({
      to: booking.customer.email,
      subject: `MASSAF Booking Cancelled — ${booking.bookingNumber}`,
      text: `Hello ${booking.customer.name},

Your booking ${booking.bookingNumber} for ${booking.service.name} on ${formattedDate} at ${formattedTime} has been CANCELLED.${reason ? `\nReason: ${reason}` : ''}

If you have any questions or wish to reschedule, please visit MASSAF at:
${appUrl}`,
    });

    // Therapist Notification (Telegram if configured, otherwise Email)
    if (booking.therapist) {
      if (booking.therapist.telegramChatId) {
        await sendTelegramMessage({
          chatId: booking.therapist.telegramChatId,
          message: `BOOKING CANCELLED

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name}
Date: ${formattedDate}
Time: ${formattedTime}${reason ? `\nReason: ${reason}` : ''}`,
        });
      } else if (booking.therapist.email) {
        await sendEmail({
          to: booking.therapist.email,
          subject: `BOOKING CANCELLED — ${booking.bookingNumber}`,
          text: `Hello ${booking.therapist.name},

The following appointment has been cancelled:

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name}
Date: ${formattedDate}
Time: ${formattedTime}${reason ? `\nReason: ${reason}` : ''}`,
        });
      }
    }

    // Admin Telegram Notification
    const adminChatId = getAdminChatId();
    if (adminChatId) {
      await sendTelegramMessage({
        chatId: adminChatId,
        message: `BOOKING CANCELLED

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Therapist: ${booking.therapist ? booking.therapist.name : 'Unassigned'}
Service: ${booking.service.name}
Date: ${formattedDate}
Time: ${formattedTime}${reason ? `\nReason: ${reason}` : ''}`,
      });
    }
  } catch (error) {
    console.error('[Notification Isolation] notifyBookingCancelled error:', error);
  }
}

/**
 * 4. COMPLETION NOTIFICATION
 * Called when a booking becomes COMPLETED. Directs customer to review flow.
 */
export async function notifyBookingCompleted(bookingId: string): Promise<void> {
  try {
    const booking = await getBookingWithDetails(bookingId);
    if (!booking || !booking.customer) return;

    const formattedDate = formatUtcDateString(booking.appointmentDateTime);
    const appUrl = getAppUrl();
    const reviewUrl = `${appUrl}/booking/success?id=${booking.id}`;

    await sendEmail({
      to: booking.customer.email,
      subject: `How was your massage? Leave a review for ${booking.therapist ? booking.therapist.name : 'MASSAF'}`,
      text: `Hello ${booking.customer.name},

Your massage session on ${formattedDate} is completed!

Booking Reference: ${booking.bookingNumber}
Service: ${booking.service.name}
Therapist: ${booking.therapist ? booking.therapist.name : 'MASSAF Therapist'}

We hope you had a relaxing and rejuvenating experience. Please take a moment to share your feedback and review your experience:
${reviewUrl}

Thank you for choosing MASSAF!`,
    });
  } catch (error) {
    console.error('[Notification Isolation] notifyBookingCompleted error:', error);
  }
}

/**
 * 5. APPOINTMENT REMINDER NOTIFICATION
 * Sent approximately 24 hours prior and 3 hours prior (same-day) before the appointment.
 */
export async function notifyBookingReminder(
  bookingId: string,
  reminderType: '24h' | '3h'
): Promise<void> {
  try {
    const booking = await getBookingWithDetails(bookingId);
    if (!booking || !booking.customer || booking.status !== 'CONFIRMED') return;

    const formattedDate = formatUtcDateString(booking.appointmentDateTime);
    const formattedTime = formatUtcTimeString(booking.appointmentDateTime);
    const appUrl = getAppUrl();
    const bookingUrl = `${appUrl}/booking/success?id=${booking.id}`;

    const timingLabel = reminderType === '24h' ? 'Tomorrow (~24 hours)' : 'Today in ~3 hours';

    // Customer Reminder
    await sendEmail({
      to: booking.customer.email,
      subject: `Upcoming MASSAF Appointment (${timingLabel}) — ${booking.bookingNumber}`,
      text: `Hello ${booking.customer.name},

Reminder: You have an upcoming massage session scheduled ${timingLabel.toLowerCase()}!

Booking Reference: ${booking.bookingNumber}
Therapist: ${booking.therapist ? booking.therapist.name : 'MASSAF Specialist'}
Service: ${booking.service.name} (${booking.durationMinutes} mins)
Date: ${formattedDate}
Time: ${formattedTime}
Type: ${booking.locationType === 'STUDIO' ? 'Studio Session' : 'In-Home Session'}

View booking details:
${bookingUrl}

Warm regards,
MASSAF Team`,
    });

    // Therapist Reminder
    if (booking.therapist) {
      if (booking.therapist.telegramChatId) {
        await sendTelegramMessage({
          chatId: booking.therapist.telegramChatId,
          message: `APPOINTMENT REMINDER (${timingLabel.toUpperCase()})

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name} (${booking.durationMinutes} mins)
Date: ${formattedDate}
Time: ${formattedTime}`,
        });
      } else if (booking.therapist.email) {
        await sendEmail({
          to: booking.therapist.email,
          subject: `Appointment Reminder (${timingLabel}) — ${booking.bookingNumber}`,
          text: `Hello ${booking.therapist.name},

Reminder for your scheduled appointment ${timingLabel.toLowerCase()}:

Booking Ref: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name} (${booking.durationMinutes} mins)
Date: ${formattedDate}
Time: ${formattedTime}
Type: ${booking.locationType}`,
        });
      }
    }

    const adminChatId = getAdminChatId();
    if (adminChatId) {
      await sendTelegramMessage({
        chatId: adminChatId,
        message: `APPOINTMENT REMINDER (${timingLabel.toUpperCase()})

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Therapist: ${booking.therapist ? booking.therapist.name : 'Unassigned'}
Date: ${formattedDate}
Time: ${formattedTime}`,
      });
    }
  } catch (error) {
    console.error('[Notification Isolation] notifyBookingReminder error:', error);
  }
}

/**
 * 6. UNPAID BOOKING EXPIRED NOTIFICATION
 * Called when an unpaid pending booking is cancelled after 30 minutes.
 */
export async function notifyBookingExpired(bookingId: string): Promise<void> {
  try {
    const booking = await getBookingWithDetails(bookingId);
    if (!booking || !booking.customer) return;

    const formattedDate = formatUtcDateString(booking.appointmentDateTime);
    const formattedTime = formatUtcTimeString(booking.appointmentDateTime);
    const appUrl = getAppUrl();

    // Customer Email
    await sendEmail({
      to: booking.customer.email,
      subject: `MASSAF Booking Expired — ${booking.bookingNumber}`,
      text: `Hello ${booking.customer.name},

Your appointment reservation ${booking.bookingNumber} for ${booking.service.name} on ${formattedDate} at ${formattedTime} has expired due to non-payment within 30 minutes and is now CANCELLED.

If you would still like to book a session, please re-book on MASSAF at:
${appUrl}/find-a-therapist

Warm regards,
MASSAF Team`,
    });

    // Admin Telegram Notification
    const adminChatId = getAdminChatId();
    if (adminChatId) {
      await sendTelegramMessage({
        chatId: adminChatId,
        message: `UNPAID BOOKING EXPIRED

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name}
Date: ${formattedDate}
Time: ${formattedTime}
Status: CANCELLED (30m unpaid timeout)`,
      });
    }
  } catch (error) {
    console.error('[Notification Isolation] notifyBookingExpired error:', error);
  }
}
