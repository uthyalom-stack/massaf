import crypto from 'crypto';
import { db } from '@/lib/db';
import {
  PaymentProviderAdapter,
  PaymentProviderId,
  PaymentMethodCategory,
  PaymentCreationInput,
  PaymentCreationResult,
  PaymentStatusInput,
  PaymentStatusResult,
  WebhookInput,
  WebhookResult,
  ProviderConfigFieldInfo,
} from '../types';

function sanitizeEnv(val: string | undefined): string {
  if (!val) return '';
  return val.trim().replace(/^["\x27]|["\x27]$/g, '');
}

export class PaymegateAdapter implements PaymentProviderAdapter {
  readonly id: PaymentProviderId = 'paymegate';
  readonly name = 'Paymegate';
  readonly description = 'Accept credit cards, debit cards, and global digital payments via Paymegate.';
  readonly supportedCategories: PaymentMethodCategory[] = ['card'];

  private getApiKey(): string {
    return sanitizeEnv(process.env.PAYMEGATE_API_KEY);
  }

  private getWebhookSecret(): string {
    return sanitizeEnv(process.env.PAYMEGATE_WEBHOOK_SECRET);
  }

  private getApiUrl(): string {
    const raw = sanitizeEnv(process.env.PAYMEGATE_API_URL);
    return (raw || 'https://api.paymegate.com/v1').replace(/\/$/, '');
  }

  isConfigured(): boolean {
    const apiKey = this.getApiKey();
    const webhookSecret = this.getWebhookSecret();
    return Boolean(apiKey && webhookSecret);
  }

  isImplemented(): boolean {
    return true;
  }

  getConfigurationInfo(): Record<string, ProviderConfigFieldInfo> {
    const apiKey = this.getApiKey();
    const webhookSecret = this.getWebhookSecret();
    return {
      apiKey: {
        label: 'API Key',
        configured: Boolean(apiKey),
      },
      webhookSecret: {
        label: 'Webhook Secret',
        configured: Boolean(webhookSecret),
      },
    };
  }

  private isMockModeAllowed(): boolean {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return process.env.NODE_ENV === 'test' || process.env.PAYMEGATE_MOCK_MODE === 'true';
  }

  async createPayment(input: PaymentCreationInput): Promise<PaymentCreationResult> {
    const apiKey = this.getApiKey();

    if (this.isMockModeAllowed() && (!apiKey || process.env.PAYMEGATE_MOCK_MODE === 'true')) {
      const mockOrderUUID = `pmg_ord_${Date.now()}`;
      const mockCheckoutUrl = `${input.successUrl || input.callbackUrl}&paymegate_mock=1&order_id=${mockOrderUUID}`;
      return {
        success: true,
        providerPaymentId: mockOrderUUID,
        checkoutUrl: mockCheckoutUrl,
      };
    }

    if (!apiKey) {
      return {
        success: false,
        error: 'PAYMEGATE_API_KEY is not configured on the server.',
      };
    }

    try {
      const apiUrl = this.getApiUrl();
      const payload = {
        externalId: input.bookingId,
        amount: Number(input.amount).toFixed(2),
        currency: (input.currency || 'USD').toUpperCase(),
        paymentMethodsKeys: ['*'],
        backUrl: input.successUrl || input.callbackUrl,
        customer: {
          email: input.customerEmail || '',
          fullName: input.customerName || 'Customer',
        },
        metadata: {
          bookingId: input.bookingId,
          bookingNumber: input.bookingNumber,
        },
      };

      const response = await fetch(`${apiUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Paymegate Error] createPayment order creation failed:', {
          status: response.status,
          endpoint: `${apiUrl}/orders`,
          errorBody: errorText,
        });
        return {
          success: false,
          error: `Paymegate payment creation failed (${response.status}): ${errorText}`,
        };
      }

      const resData = await response.json();
      const orderData = resData.data || resData;

      const orderUUID = String(orderData.orderUUID || orderData.id || orderData.orderId || '');
      const checkoutUrl = String(orderData.checkoutUrl || orderData.url || '');

      if (!checkoutUrl) {
        return {
          success: false,
          error: 'Paymegate response missing valid checkoutUrl.',
        };
      }

      return {
        success: true,
        providerPaymentId: orderUUID,
        checkoutUrl,
        rawResponse: resData,
      };
    } catch (err: unknown) {
      console.error('Error creating Paymegate order:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error communicating with Paymegate API.',
      };
    }
  }

  async getPaymentStatus(input: PaymentStatusInput): Promise<PaymentStatusResult> {
    const apiKey = this.getApiKey();

    if (this.isMockModeAllowed() && (!apiKey || process.env.PAYMEGATE_MOCK_MODE === 'true')) {
      return {
        success: true,
        status: 'PAID',
        error: 'Paymegate mock mode status.',
      };
    }

    if (!apiKey) {
      return {
        success: false,
        status: 'UNKNOWN',
        error: 'PAYMEGATE_API_KEY is missing.',
      };
    }

    try {
      const apiUrl = this.getApiUrl();
      const response = await fetch(`${apiUrl}/orders/${encodeURIComponent(input.providerPaymentId)}`, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
        },
      });

      if (!response.ok) {
        return {
          success: false,
          status: 'UNKNOWN',
          error: `Failed to fetch Paymegate order status (${response.status})`,
        };
      }

      const resData = await response.json();
      const orderData = resData.data || resData;
      const rawStatus = String(orderData.status || '').toUpperCase();

      let status: PaymentStatusResult['status'] = 'PENDING';
      if (rawStatus === 'PAID') {
        status = 'PAID';
      } else if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(rawStatus)) {
        status = 'FAILED';
      }

      return {
        success: true,
        status,
        amount: Number(orderData.amount || 0) || undefined,
        currency: String(orderData.currency || 'USD'),
        rawResponse: resData,
      };
    } catch (err: unknown) {
      return {
        success: false,
        status: 'UNKNOWN',
        error: err instanceof Error ? err.message : 'Error checking Paymegate order status.',
      };
    }
  }

  verifyWebhookSignature(payload: unknown, signature: string): boolean {
    const webhookSecret = this.getWebhookSecret();
    if (!webhookSecret) return false;

    if (this.isMockModeAllowed()) {
      return true;
    }

    try {
      const rawString = typeof payload === 'string' ? payload : JSON.stringify(payload);

      // Check direct secret match or HMAC-SHA256 signature
      if (crypto.timingSafeEqual(Buffer.from(signature.trim()), Buffer.from(webhookSecret))) {
        return true;
      }

      const hmac256 = crypto.createHmac('sha256', webhookSecret).update(rawString).digest('hex');
      if (crypto.timingSafeEqual(Buffer.from(hmac256, 'hex'), Buffer.from(signature.trim(), 'hex'))) {
        return true;
      }

      const hmac512 = crypto.createHmac('sha512', webhookSecret).update(rawString).digest('hex');
      if (crypto.timingSafeEqual(Buffer.from(hmac512, 'hex'), Buffer.from(signature.trim(), 'hex'))) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async handleWebhook(input: WebhookInput): Promise<WebhookResult> {
    try {
      const sigHeader =
        input.headers['x-paymegate-signature'] ||
        input.headers['x-signature'] ||
        input.headers['x-paymegate-sig'] ||
        '';
      const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

      const body = (typeof input.body === 'object' && input.body !== null)
        ? (input.body as Record<string, any>)
        : {};

      if (!signature && !this.isMockModeAllowed()) {
        return {
          success: false,
          error: 'Missing Paymegate webhook signature header.',
          httpStatus: 401,
        };
      }

      if (signature && !this.verifyWebhookSignature(body, signature)) {
        return {
          success: false,
          error: 'Invalid Paymegate webhook signature.',
          httpStatus: 401,
        };
      }

      const eventType = String(body.type || body.event || '').toLowerCase();
      const rawStatus = String(body.status || '').toUpperCase();

      if (eventType !== 'order.paid' && rawStatus !== 'PAID') {
        return {
          success: true,
          httpStatus: 200,
          error: `Non-terminal event '${eventType}' or status '${rawStatus}' ignored.`,
        };
      }

      const bookingId = String(
        body.externalId ||
        body.metadata?.bookingId ||
        input.query?.bookingId ||
        ''
      );

      if (!bookingId) {
        return {
          success: false,
          error: 'Missing booking identity in Paymegate webhook payload.',
          httpStatus: 400,
        };
      }

      const booking = await db.booking.findUnique({
        where: { id: bookingId },
      });

      if (!booking) {
        return {
          success: false,
          error: `Booking record '${bookingId}' not found.`,
          httpStatus: 404,
        };
      }

      if (booking.paymentStatus === 'PAID') {
        return {
          success: true,
          httpStatus: 200,
          event: {
            providerId: 'paymegate',
            providerPaymentId: String(body.orderUUID || body.id || booking.paymentReference || ''),
            bookingId: booking.id,
            status: 'PAID',
            amount: booking.amount,
            currency: 'USD',
            paymentMethod: 'CARD',
            rawPayload: body,
          },
        };
      }

      const receivedAmount = body.amount !== undefined ? Number(body.amount) : undefined;
      if (typeof receivedAmount === 'number' && Math.abs(receivedAmount - booking.amount) > 0.01) {
        return {
          success: false,
          error: `Paymegate webhook amount mismatch: expected $${booking.amount}, got $${receivedAmount}.`,
          httpStatus: 400,
        };
      }

      const providerPaymentId = String(body.orderUUID || body.id || booking.paymentReference || '');

      const updatedBooking = await db.booking.update({
        where: { id: booking.id },
        data: {
          paymentStatus: 'PAID',
          paymentMethod: 'CARD',
          paymentReference: providerPaymentId || booking.paymentReference,
          status: booking.status === 'PENDING' ? 'CONFIRMED' : booking.status,
        },
      });

      try {
        const { notifyBookingConfirmed } = await import('@/lib/notifications');
        await notifyBookingConfirmed(updatedBooking.id);
      } catch (notifErr) {
        console.error('Paymegate notification dispatch warning:', notifErr);
      }

      return {
        success: true,
        httpStatus: 200,
        event: {
          providerId: 'paymegate',
          providerPaymentId,
          bookingId: updatedBooking.id,
          status: 'PAID',
          amount: updatedBooking.amount,
          currency: 'USD',
          paymentMethod: 'CARD',
          rawPayload: body,
        },
      };
    } catch (err: unknown) {
      console.error('Error handling Paymegate webhook:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Internal error processing Paymegate webhook.',
        httpStatus: 500,
      };
    }
  }
}
