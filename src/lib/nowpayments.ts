import crypto from 'crypto';
import { db } from '@/lib/db';
import { getCanonicalBaseUrl } from '@/app/api/payments/paylio/create/route';

export interface CreateNowPaymentsInvoiceParams {
  bookingId: string;
  bookingNumber: string;
  amount: number; // in USD
  customerEmail?: string;
  callbackUrl: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateNowPaymentsInvoiceResult {
  invoiceId: string;
  invoiceUrl: string;
  orderId: string;
  priceAmount: number;
  priceCurrency: string;
}

function sanitizeEnv(val: string | undefined): string {
  if (!val) return '';
  return val.trim().replace(/^["\x27]|["\x27]$/g, '');
}

export class NowPaymentsClient {
  private apiKey: string;
  private ipnSecret: string;
  private apiUrl: string;

  constructor() {
    this.apiKey = sanitizeEnv(process.env.NOWPAYMENTS_API_KEY);
    this.ipnSecret = sanitizeEnv(process.env.NOWPAYMENTS_IPN_SECRET);
    this.apiUrl = (sanitizeEnv(process.env.NOWPAYMENTS_API_URL) || 'https://api.nowpayments.io/v1').replace(/\/$/, '');
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.ipnSecret);
  }

  private isMockModeAllowed(): boolean {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return process.env.NODE_ENV === 'test' || process.env.NOWPAYMENTS_MOCK_MODE === 'true';
  }

  async createInvoice(params: CreateNowPaymentsInvoiceParams): Promise<CreateNowPaymentsInvoiceResult> {
    if (this.isMockModeAllowed()) {
      const mockInvoiceId = `nowpay_inv_${Date.now()}`;
      return {
        invoiceId: mockInvoiceId,
        invoiceUrl: `${params.successUrl}&nowpay_mock=1&invoice_id=${mockInvoiceId}`,
        orderId: params.bookingId,
        priceAmount: params.amount,
        priceCurrency: 'usd',
      };
    }

    if (!this.apiKey) {
      throw new Error('NOWPAYMENTS_API_KEY is not configured on the server.');
    }

    let callbackUrl = params.callbackUrl;
    if (process.env.NODE_ENV === 'production' && !callbackUrl.startsWith('https://')) {
      callbackUrl = callbackUrl.replace(/^http:\/\//, 'https://');
      if (!callbackUrl.startsWith('https://')) {
        callbackUrl = `https://${callbackUrl}`;
      }
    }

    let successUrl = params.successUrl;
    if (process.env.NODE_ENV === 'production' && !successUrl.startsWith('https://')) {
      successUrl = successUrl.replace(/^http:\/\//, 'https://');
      if (!successUrl.startsWith('https://')) {
        successUrl = `https://${successUrl}`;
      }
    }

    const payload = {
      price_amount: params.amount,
      price_currency: 'usd',
      ipn_callback_url: callbackUrl,
      order_id: params.bookingId,
      order_description: `MASSAF Booking ${params.bookingNumber}`,
      success_url: successUrl,
      cancel_url: params.cancelUrl,
    };

    const response = await fetch(`${this.apiUrl}/invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[NOWPayments Error] createInvoice failed:', {
        status: response.status,
        endpoint: `${this.apiUrl}/invoice`,
        apiKeyConfigured: Boolean(this.apiKey),
        apiKeyLength: this.apiKey.length,
        errorBody: errorText,
      });
      throw new Error(`NOWPayments invoice creation failed (${response.status})`);
    }

    const data = await response.json();

    const invoiceId = String(data.id || data.invoice_id);
    const invoiceUrl = data.invoice_url || data.url;

    if (!invoiceId || !invoiceUrl) {
      throw new Error('NOWPayments response missing invoice ID or checkout URL');
    }

    return {
      invoiceId,
      invoiceUrl,
      orderId: params.bookingId,
      priceAmount: params.amount,
      priceCurrency: 'usd',
    };
  }

  verifyIpnSignature(payload: Record<string, any>, signature: string): boolean {
    if (!payload || !signature || !this.ipnSecret) return false;
    try {
      const sortedKeys = Object.keys(payload).sort();
      const sortedObj: Record<string, any> = {};
      for (const key of sortedKeys) {
        sortedObj[key] = payload[key];
      }
      const jsonStr = JSON.stringify(sortedObj);
      const hmac = crypto.createHmac('sha512', this.ipnSecret).update(jsonStr).digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(hmac, 'hex'),
        Buffer.from(signature.trim(), 'hex')
      );
    } catch (err) {
      console.error('[NOWPayments Signature Error]', err);
      return false;
    }
  }
}

export const nowPaymentsClient = new NowPaymentsClient();

export interface ProcessNowPaymentsIpnOptions {
  payload: Record<string, any>;
  signature: string;
}

export async function processNowPaymentsIpn(options: ProcessNowPaymentsIpnOptions) {
  const { payload, signature } = options;

  // 1. Signature Verification
  if (!nowPaymentsClient.verifyIpnSignature(payload, signature)) {
    if (process.env.NOWPAYMENTS_MOCK_MODE === 'true' || process.env.NODE_ENV === 'test') {
      console.log('[NOWPayments IPN] Mock mode bypass signature check');
    } else {
      console.warn('[SECURITY WARNING] NOWPayments IPN signature verification failed.');
      return { success: false, status: 401, error: 'Invalid IPN signature.' };
    }
  }

  const bookingId = payload.order_id || payload.orderId;
  const paymentStatus = String(payload.payment_status || payload.status || '').toLowerCase();
  const priceAmount = payload.price_amount !== undefined ? Number(payload.price_amount) : undefined;
  const priceCurrency = String(payload.price_currency || 'usd').toLowerCase();

  if (!bookingId) {
    return { success: false, status: 400, error: 'Missing order_id / bookingId in IPN payload.' };
  }

  // 2. Fetch booking
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    return { success: false, status: 404, error: 'Booking record not found.' };
  }

  // 3. Idempotency: If already PAID, return success safely
  if (booking.paymentStatus === 'PAID') {
    return {
      success: true,
      status: 200,
      message: 'Booking is already recorded as PAID (idempotent).',
    };
  }

  // 4. Validate currency & amount for terminal success statuses
  if (['finished', 'confirmed'].includes(paymentStatus)) {
    if (priceCurrency !== 'usd') {
      return { success: false, status: 400, error: `Invalid currency ${priceCurrency}. Expected USD.` };
    }

    if (typeof priceAmount !== 'number' || Math.abs(priceAmount - booking.amount) > 0.01) {
      return {
        success: false,
        status: 400,
        error: `Amount mismatch: expected $${booking.amount}, got $${priceAmount}.`,
      };
    }

    // Update booking state atomically to PAID & CONFIRMED
    const updatedBooking = await db.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: 'PAID',
        paymentMethod: 'CRYPTO',
        paymentReference: payload.payment_id ? String(payload.payment_id) : booking.paymentReference,
        status: booking.status === 'PENDING' ? 'CONFIRMED' : booking.status,
      },
    });

    try {
      const { notifyBookingConfirmed } = await import('@/lib/notifications');
      await notifyBookingConfirmed(updatedBooking.id);
    } catch (notifErr) {
      console.error('NOWPayments notification dispatch warning:', notifErr);
    }

    return { success: true, status: 200, message: 'Payment confirmed and booking updated to PAID.' };
  }

  if (['failed', 'expired'].includes(paymentStatus)) {
    await db.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: 'FAILED',
        paymentMethod: 'CRYPTO',
      },
    });
    return { success: true, status: 200, message: 'Payment failed/expired status recorded.' };
  }

  // Intermediate statuses ('waiting', 'confirming', 'partially_paid') remain PENDING
  await db.booking.update({
    where: { id: booking.id },
    data: {
      paymentMethod: 'CRYPTO',
      paymentReference: payload.payment_id ? String(payload.payment_id) : booking.paymentReference,
    },
  });

  return { success: true, status: 200, message: `Status ${paymentStatus} recorded as PENDING.` };
}
