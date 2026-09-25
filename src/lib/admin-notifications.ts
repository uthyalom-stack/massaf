import { db } from '@/lib/db';
import { sendTelegramMessage } from '@/lib/notifications/telegram';

export interface CreateAdminNotificationParams {
  type: string;
  title: string;
  message: string;
  link?: string | null;
  sendTelegram?: boolean;
}

export async function createAdminNotification(params: CreateAdminNotificationParams): Promise<void> {
  try {
    await db.adminNotification.create({
      data: {
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link || null,
        isRead: false,
      },
    });

    if (params.sendTelegram !== false && process.env.TELEGRAM_ADMIN_CHAT_ID) {
      const telegramText = `🔔 *${params.title}*\n${params.message}`;
      await sendTelegramMessage({
        chatId: process.env.TELEGRAM_ADMIN_CHAT_ID,
        message: telegramText,
      });
    }
  } catch (err) {
    console.error('[createAdminNotification] Error creating admin notification:', err);
    // Failure isolation: Notification creation failure should not roll back database transactions
  }
}
