export interface SendTelegramOptions {
  chatId: string;
  message: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
}

export interface SendTelegramResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

/**
 * Server-only Telegram Bot Provider Abstraction Utility.
 * Sends operational notifications via official Telegram Bot API (https://api.telegram.org/bot<token>/sendMessage).
 * Server-side ONLY: NEVER expose TELEGRAM_BOT_TOKEN to client or via NEXT_PUBLIC_*.
 * Guarantees failure isolation (catches all network/API exceptions and logs safely).
 */
export async function sendTelegramMessage(options: SendTelegramOptions): Promise<SendTelegramResult> {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!options.chatId || options.chatId.trim().length === 0) {
      return { success: false, error: 'Telegram chatId is missing or empty' };
    }

    if (botToken && botToken.trim().length > 0) {
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: options.chatId,
          text: options.message,
          parse_mode: options.parseMode || undefined,
          disable_web_page_preview: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Telegram API Error]', response.status, errorText);
        return { success: false, error: `Telegram API error (${response.status}): ${errorText}` };
      }

      const data = await response.json();
      return {
        success: Boolean(data.ok),
        messageId: data.result?.message_id,
        error: data.ok ? undefined : 'Telegram API returned ok: false',
      };
    }

    // Mock / Test Mode: Only enabled if TELEGRAM_MOCK_MODE === 'true' or NODE_ENV === 'test'
    if (process.env.TELEGRAM_MOCK_MODE === 'true' || process.env.NODE_ENV === 'test') {
      console.log('[Telegram Message Dispatched (Mock/Dev Mode)]', {
        chatId: options.chatId,
        messagePreview: options.message.slice(0, 100),
      });

      return {
        success: true,
        messageId: Math.floor(Math.random() * 1000000),
      };
    }

    // Unconfigured in production -> Report explicit configuration error (never fake success)
    console.warn('[Telegram Provider] TELEGRAM_BOT_TOKEN is not configured on server.');
    return {
      success: false,
      error: 'TELEGRAM_BOT_TOKEN is not configured on the server',
    };
  } catch (error) {
    console.error('[Telegram Dispatch Exception]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Telegram dispatch error',
    };
  }
}
