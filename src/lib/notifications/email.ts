export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Server-only Email Abstraction Utility.
 * Sends emails via configured provider (Resend API if RESEND_API_KEY is configured)
 * or falls back to server-side logging during development/testing.
 * Strictly guarantees error isolation (never throws uncaught exceptions).
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  try {
    const resendApiKey = process.env.RESEND_API_KEY;

    if (resendApiKey) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'MASSAF <notifications@massaf.com>',
          to: [options.to],
          subject: options.subject,
          text: options.text,
          html: options.html || `<p>${options.text.replace(/\n/g, '<br>')}</p>`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Email Provider Error]', response.status, errorText);
        return { success: false, error: `Email provider error (${response.status})` };
      }

      const data = await response.json();
      return { success: true, messageId: data.id };
    }

    // Mock / Console Fallback Mode
    console.log('[Email Dispatched (Mock/Dev Mode)]', {
      to: options.to,
      subject: options.subject,
      preview: options.text.slice(0, 100),
    });

    return {
      success: true,
      messageId: `mock_email_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    };
  } catch (error) {
    console.error('[Email Dispatch Exception]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown email dispatch error',
    };
  }
}
