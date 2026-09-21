import { db } from '@/lib/db';
import { sendEmail } from './email';
import { sendTelegramMessage } from './telegram';
import { formatUtcDateString, formatUtcTimeString } from '@/lib/timezone';

export interface ChannelResult {
  channel: 'email' | 'telegram';
  recipient: string;
  success: boolean;
  error?: string;
}

export interface NotificationResult {
  success: boolean;
  channelResults: ChannelResult[];
  error?: string;
}

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function getAdminChatId(): string | undefined {
  return process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
}

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
 * Triggers when a booking is created (PENDING + UNPAID).
 */
export async function notifyBookingCreated(bookingId: string): Promise<NotificationResult> {
  const channelResults: ChannelResult[] = [];
  try {
    const booking = await getBookingWithDetails(bookingId);
    if (!booking || !booking.customer) {
      return { success: false, channelResults: [], error: 'Booking or customer record not found' };
    }

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

    const emailRes = await sendEmail({
      to: booking.customer.email,
      subject,
      text,
    });

    channelResults.push({
      channel: 'email',
      recipient: booking.customer.email,
      success: emailRes.success,
      error: emailRes.error,
    });

    return {
      success: emailRes.success,
      channelResults,
    };
  } catch (error) {
    console.error('[Notification Isolation] notifyBookingCreated error:', error);
    return {
      success: false,
      channelResults,
      error: error instanceof Error ? error.message : 'Unknown notification error',
    };
  }
}

/**
 * 2. PAYMENT CONFIRMATION NOTIFICATION
 * Triggers when server verifies payment (PAID + CONFIRMED).
 */
export async function notifyBookingConfirmed(bookingId: string): Promise<NotificationResult> {
  const channelResults: ChannelResult[] = [];
  try {
    const booking = await getBookingWithDetails(bookingId);
    if (!booking || !booking.customer) {
      return { success: false, channelResults: [], error: 'Booking or customer record not found' };
    }

    const formattedDate = formatUtcDateString(booking.appointmentDateTime);
    const formattedTime = formatUtcTimeString(booking.appointmentDateTime);
    const appUrl = getAppUrl();
    const bookingUrl = `${appUrl}/booking/success?id=${booking.id}`;

    // Customer Email
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

    const custEmailRes = await sendEmail({
      to: booking.customer.email,
      subject: customerSubject,
      text: customerText,
    });

    channelResults.push({
      channel: 'email',
      recipient: booking.customer.email,
      success: custEmailRes.success,
      error: custEmailRes.error,
    });

    // Therapist Operational Notification
    if (booking.therapist) {
      if (booking.therapist.telegramChatId) {
        const therapistTelegramMsg = `MASSAF — NEW CONFIRMED BOOKING

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name} (${booking.durationMinutes} mins)
Date: ${formattedDate}
Time: ${formattedTime}
Type: ${booking.locationType === 'STUDIO' ? 'Studio' : 'In-Home'}
${booking.locationType === 'IN_HOME' && booking.addressLine1 ? `Location: ${booking.addressLine1}, ${booking.city || ''}, ${booking.state || ''}` : ''}
Amount: $${booking.amount.toFixed(2)}`;

        const tgRes = await sendTelegramMessage({
          chatId: booking.therapist.telegramChatId,
          message: therapistTelegramMsg,
        });

        channelResults.push({
          channel: 'telegram',
          recipient: `therapist_tg_${booking.therapist.telegramChatId}`,
          success: tgRes.success,
          error: tgRes.error,
        });
      } else if (booking.therapist.email) {
        const thEmailRes = await sendEmail({
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

        channelResults.push({
          channel: 'email',
          recipient: booking.therapist.email,
          success: thEmailRes.success,
          error: thEmailRes.error,
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

      const adminTgRes = await sendTelegramMessage({
        chatId: adminChatId,
        message: adminTelegramMsg,
      });

      channelResults.push({
        channel: 'telegram',
        recipient: `admin_tg_${adminChatId}`,
        success: adminTgRes.success,
        error: adminTgRes.error,
      });
    }

    const overallSuccess = channelResults.some((r) => r.success);
    return {
      success: overallSuccess,
      channelResults,
    };
  } catch (error) {
    console.error('[Notification Isolation] notifyBookingConfirmed error:', error);
    return {
      success: false,
      channelResults,
      error: error instanceof Error ? error.message : 'Unknown notification error',
    };
  }
}

/**
 * 3. CANCELLATION NOTIFICATION
 */
export async function notifyBookingCancelled(bookingId: string, reason?: string): Promise<NotificationResult> {
  const channelResults: ChannelResult[] = [];
  try {
    const booking = await getBookingWithDetails(bookingId);
    if (!booking || !booking.customer) {
      return { success: false, channelResults: [], error: 'Booking or customer record not found' };
    }

    const formattedDate = formatUtcDateString(booking.appointmentDateTime);
    const formattedTime = formatUtcTimeString(booking.appointmentDateTime);
    const appUrl = getAppUrl();

    // Customer Email
    const custEmailRes = await sendEmail({
      to: booking.customer.email,
      subject: `MASSAF Booking Cancelled — ${booking.bookingNumber}`,
      text: `Hello ${booking.customer.name},

Your booking ${booking.bookingNumber} for ${booking.service.name} on ${formattedDate} at ${formattedTime} has been CANCELLED.${reason ? `\nReason: ${reason}` : ''}

If you have any questions or wish to reschedule, please visit MASSAF at:
${appUrl}`,
    });

    channelResults.push({
      channel: 'email',
      recipient: booking.customer.email,
      success: custEmailRes.success,
      error: custEmailRes.error,
    });

    // Therapist Notification
    if (booking.therapist) {
      if (booking.therapist.telegramChatId) {
        const tgRes = await sendTelegramMessage({
          chatId: booking.therapist.telegramChatId,
          message: `BOOKING CANCELLED

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name}
Date: ${formattedDate}
Time: ${formattedTime}${reason ? `\nReason: ${reason}` : ''}`,
        });

        channelResults.push({
          channel: 'telegram',
          recipient: `therapist_tg_${booking.therapist.telegramChatId}`,
          success: tgRes.success,
          error: tgRes.error,
        });
      } else if (booking.therapist.email) {
        const thEmailRes = await sendEmail({
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

        channelResults.push({
          channel: 'email',
          recipient: booking.therapist.email,
          success: thEmailRes.success,
          error: thEmailRes.error,
        });
      }
    }

    // Admin Telegram Notification
    const adminChatId = getAdminChatId();
    if (adminChatId) {
      const adminTgRes = await sendTelegramMessage({
        chatId: adminChatId,
        message: `BOOKING CANCELLED

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Therapist: ${booking.therapist ? booking.therapist.name : 'Unassigned'}
Service: ${booking.service.name}
Date: ${formattedDate}
Time: ${formattedTime}${reason ? `\nReason: ${reason}` : ''}`,
      });

      channelResults.push({
        channel: 'telegram',
        recipient: `admin_tg_${adminChatId}`,
        success: adminTgRes.success,
        error: adminTgRes.error,
      });
    }

    const overallSuccess = channelResults.some((r) => r.success);
    return {
      success: overallSuccess,
      channelResults,
    };
  } catch (error) {
    console.error('[Notification Isolation] notifyBookingCancelled error:', error);
    return {
      success: false,
      channelResults,
      error: error instanceof Error ? error.message : 'Unknown notification error',
    };
  }
}

/**
 * 4. COMPLETION NOTIFICATION
 */
export async function notifyBookingCompleted(bookingId: string): Promise<NotificationResult> {
  const channelResults: ChannelResult[] = [];
  try {
    const booking = await getBookingWithDetails(bookingId);
    if (!booking || !booking.customer) {
      return { success: false, channelResults: [], error: 'Booking or customer record not found' };
    }

    const formattedDate = formatUtcDateString(booking.appointmentDateTime);
    const appUrl = getAppUrl();
    const reviewUrl = `${appUrl}/booking/success?id=${booking.id}`;

    const custEmailRes = await sendEmail({
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

    channelResults.push({
      channel: 'email',
      recipient: booking.customer.email,
      success: custEmailRes.success,
      error: custEmailRes.error,
    });

    return {
      success: custEmailRes.success,
      channelResults,
    };
  } catch (error) {
    console.error('[Notification Isolation] notifyBookingCompleted error:', error);
    return {
      success: false,
      channelResults,
      error: error instanceof Error ? error.message : 'Unknown notification error',
    };
  }
}

/**
 * 5. APPOINTMENT REMINDER NOTIFICATION
 */
export async function notifyBookingReminder(
  bookingId: string,
  reminderType: '24h' | '3h'
): Promise<NotificationResult> {
  const channelResults: ChannelResult[] = [];
  try {
    const booking = await getBookingWithDetails(bookingId);
    if (!booking || !booking.customer || booking.status !== 'CONFIRMED') {
      return { success: false, channelResults: [], error: 'Eligible confirmed booking or customer record not found' };
    }

    const formattedDate = formatUtcDateString(booking.appointmentDateTime);
    const formattedTime = formatUtcTimeString(booking.appointmentDateTime);
    const appUrl = getAppUrl();
    const bookingUrl = `${appUrl}/booking/success?id=${booking.id}`;

    const timingLabel = reminderType === '24h' ? 'Tomorrow (~24 hours)' : 'Today in ~3 hours';

    // Customer Reminder
    const custEmailRes = await sendEmail({
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

    channelResults.push({
      channel: 'email',
      recipient: booking.customer.email,
      success: custEmailRes.success,
      error: custEmailRes.error,
    });

    // Therapist Reminder
    if (booking.therapist) {
      if (booking.therapist.telegramChatId) {
        const tgRes = await sendTelegramMessage({
          chatId: booking.therapist.telegramChatId,
          message: `APPOINTMENT REMINDER (${timingLabel.toUpperCase()})

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name} (${booking.durationMinutes} mins)
Date: ${formattedDate}
Time: ${formattedTime}`,
        });

        channelResults.push({
          channel: 'telegram',
          recipient: `therapist_tg_${booking.therapist.telegramChatId}`,
          success: tgRes.success,
          error: tgRes.error,
        });
      } else if (booking.therapist.email) {
        const thEmailRes = await sendEmail({
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

        channelResults.push({
          channel: 'email',
          recipient: booking.therapist.email,
          success: thEmailRes.success,
          error: thEmailRes.error,
        });
      }
    }

    const adminChatId = getAdminChatId();
    if (adminChatId) {
      const adminTgRes = await sendTelegramMessage({
        chatId: adminChatId,
        message: `APPOINTMENT REMINDER (${timingLabel.toUpperCase()})

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Therapist: ${booking.therapist ? booking.therapist.name : 'Unassigned'}
Date: ${formattedDate}
Time: ${formattedTime}`,
      });

      channelResults.push({
        channel: 'telegram',
        recipient: `admin_tg_${adminChatId}`,
        success: adminTgRes.success,
        error: adminTgRes.error,
      });
    }

    const overallSuccess = channelResults.some((r) => r.success);
    return {
      success: overallSuccess,
      channelResults,
    };
  } catch (error) {
    console.error('[Notification Isolation] notifyBookingReminder error:', error);
    return {
      success: false,
      channelResults,
      error: error instanceof Error ? error.message : 'Unknown notification error',
    };
  }
}

/**
 * 6. UNPAID BOOKING EXPIRED NOTIFICATION
 */
/**
 * 7. THERAPIST PORTAL LOGIN VERIFICATION TOKEN NOTIFICATION
 */
export async function notifyTherapistLoginToken(
  therapistId: string,
  token: string
): Promise<NotificationResult> {
  const channelResults: ChannelResult[] = [];
  try {
    const therapist = await db.therapist.findUnique({
      where: { id: therapistId },
    });

    if (!therapist) {
      return { success: false, channelResults: [], error: 'Therapist record not found' };
    }

    const appUrl = getAppUrl();
    const loginLink = `${appUrl}/therapist/login?token=${token}`;
    const text = `Hello ${therapist.name},

Here is your short-lived single-use verification token to access your MASSAF Therapist Portal:

Verification Token: ${token}

Or click the link below to verify directly:
${loginLink}

This token expires in 15 minutes. If you did not request this token, please ignore this message.

Warm regards,
MASSAF Platform`;

    if (therapist.telegramChatId) {
      const tgRes = await sendTelegramMessage({
        chatId: therapist.telegramChatId,
        message: `MASSAF THERAPIST LOGIN TOKEN

Token: ${token}
Link: ${loginLink}

Expires in 15 minutes.`,
      });
      channelResults.push({
        channel: 'telegram',
        recipient: `therapist_tg_${therapist.telegramChatId}`,
        success: tgRes.success,
        error: tgRes.error,
      });
    } else if (therapist.email) {
      const emailRes = await sendEmail({
        to: therapist.email,
        subject: `MASSAF Therapist Portal Login Token`,
        text,
      });
      channelResults.push({
        channel: 'email',
        recipient: therapist.email,
        success: emailRes.success,
        error: emailRes.error,
      });
    }

    return {
      success: channelResults.some((r) => r.success),
      channelResults,
    };
  } catch (error) {
    console.error('[Notification Isolation] notifyTherapistLoginToken error:', error);
    return {
      success: false,
      channelResults,
      error: error instanceof Error ? error.message : 'Unknown notification error',
    };
  }
}

/**
 * 8. RESCHEDULE NOTIFICATION
 * Triggers when a booking appointment date/time is rescheduled.
 */
export async function notifyBookingRescheduled(
  bookingId: string,
  oldDateTime: Date,
  newDateTime: Date
): Promise<NotificationResult> {
  const channelResults: ChannelResult[] = [];
  try {
    const booking = await getBookingWithDetails(bookingId);
    if (!booking || !booking.customer) {
      return { success: false, channelResults: [], error: 'Booking or customer record not found' };
    }

    const oldDateStr = formatUtcDateString(oldDateTime);
    const oldTimeStr = formatUtcTimeString(oldDateTime);
    const newDateStr = formatUtcDateString(newDateTime);
    const newTimeStr = formatUtcTimeString(newDateTime);
    const appUrl = getAppUrl();
    const bookingUrl = `${appUrl}/booking/success?id=${booking.id}`;

    // Customer Email
    const custEmailRes = await sendEmail({
      to: booking.customer.email,
      subject: `MASSAF Booking Rescheduled — ${booking.bookingNumber}`,
      text: `Hello ${booking.customer.name},

Your massage appointment has been successfully rescheduled.

Booking Reference: ${booking.bookingNumber}
Service: ${booking.service.name} (${booking.durationMinutes} mins)
Therapist: ${booking.therapist ? booking.therapist.name : 'MASSAF Specialist'}

Old Appointment: ${oldDateStr} at ${oldTimeStr}
New Appointment: ${newDateStr} at ${newTimeStr}

View updated booking details:
${bookingUrl}

Warm regards,
MASSAF Team`,
    });

    channelResults.push({
      channel: 'email',
      recipient: booking.customer.email,
      success: custEmailRes.success,
      error: custEmailRes.error,
    });

    // Therapist Notification
    if (booking.therapist) {
      if (booking.therapist.telegramChatId) {
        const tgRes = await sendTelegramMessage({
          chatId: booking.therapist.telegramChatId,
          message: `BOOKING RESCHEDULED

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name}
Old Time: ${oldDateStr} at ${oldTimeStr}
New Time: ${newDateStr} at ${newTimeStr}`,
        });

        channelResults.push({
          channel: 'telegram',
          recipient: `therapist_tg_${booking.therapist.telegramChatId}`,
          success: tgRes.success,
          error: tgRes.error,
        });
      } else if (booking.therapist.email) {
        const thEmailRes = await sendEmail({
          to: booking.therapist.email,
          subject: `BOOKING RESCHEDULED — ${booking.bookingNumber}`,
          text: `Hello ${booking.therapist.name},

The following appointment has been rescheduled:

Booking Ref: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name}
Old Time: ${oldDateStr} at ${oldTimeStr}
New Time: ${newDateStr} at ${newTimeStr}`,
        });

        channelResults.push({
          channel: 'email',
          recipient: booking.therapist.email,
          success: thEmailRes.success,
          error: thEmailRes.error,
        });
      }
    }

    const overallSuccess = channelResults.some((r) => r.success);
    return {
      success: overallSuccess,
      channelResults,
    };
  } catch (error) {
    console.error('[Notification Isolation] notifyBookingRescheduled error:', error);
    return {
      success: false,
      channelResults,
      error: error instanceof Error ? error.message : 'Unknown notification error',
    };
  }
}

export async function notifyBookingExpired(bookingId: string): Promise<NotificationResult> {
  const channelResults: ChannelResult[] = [];
  try {
    const booking = await getBookingWithDetails(bookingId);
    if (!booking || !booking.customer) {
      return { success: false, channelResults: [], error: 'Booking or customer record not found' };
    }

    const formattedDate = formatUtcDateString(booking.appointmentDateTime);
    const formattedTime = formatUtcTimeString(booking.appointmentDateTime);
    const appUrl = getAppUrl();

    // Customer Email
    const custEmailRes = await sendEmail({
      to: booking.customer.email,
      subject: `MASSAF Booking Expired — ${booking.bookingNumber}`,
      text: `Hello ${booking.customer.name},

Your appointment reservation ${booking.bookingNumber} for ${booking.service.name} on ${formattedDate} at ${formattedTime} has expired due to non-payment within 30 minutes and is now CANCELLED.

If you would still like to book a session, please re-book on MASSAF at:
${appUrl}/find-a-therapist

Warm regards,
MASSAF Team`,
    });

    channelResults.push({
      channel: 'email',
      recipient: booking.customer.email,
      success: custEmailRes.success,
      error: custEmailRes.error,
    });

    // Admin Telegram Notification
    const adminChatId = getAdminChatId();
    if (adminChatId) {
      const adminTgRes = await sendTelegramMessage({
        chatId: adminChatId,
        message: `UNPAID BOOKING EXPIRED

Booking: ${booking.bookingNumber}
Customer: ${booking.customer.name}
Service: ${booking.service.name}
Date: ${formattedDate}
Time: ${formattedTime}
Status: CANCELLED (30m unpaid timeout)`,
      });

      channelResults.push({
        channel: 'telegram',
        recipient: `admin_tg_${adminChatId}`,
        success: adminTgRes.success,
        error: adminTgRes.error,
      });
    }

    const overallSuccess = channelResults.some((r) => r.success);
    return {
      success: overallSuccess,
      channelResults,
    };
  } catch (error) {
    console.error('[Notification Isolation] notifyBookingExpired error:', error);
    return {
      success: false,
      channelResults,
      error: error instanceof Error ? error.message : 'Unknown notification error',
    };
  }
}
