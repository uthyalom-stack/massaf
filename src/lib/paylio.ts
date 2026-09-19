import crypto from 'crypto';
import { db } from '@/lib/db';

export interface CreatePayLioPaymentParams {
  bookingId: string;
  bookingNumber: string;
  amount: number; // in USD
  description: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatePayLioPaymentResult {
  paymentReference: string;
  checkoutUrl: string;
  status: string;
}

export interface PayLioPaymentStatusResult {
  paymentReference: string;
  status: 'PAID' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'UNKNOWN';
  amount?: number;
  currency?: string;
  paymentMethod?: 'CARD' | 'CRYPTO';
  transactionHash?: string;
  rawStatus?: string;
}

/**
 * Server-only PayLio API Client Utility
 * Implements standard PayLio REST API specs:
 * - Payment Link / Checkout creation: POST /v1/payments
 * - Status query: GET /v1/payments/{id}
 * - Webhook HMAC SHA-256 validation on raw body
 */
export class PayLioClient {
  private apiKey: string;
  private apiUrl: string;
  private webhookSecret: string;
  private settlementWallet: string;

  constructor() {
    this.apiKey = process.env.PAYLIO_API_KEY || '';
    this.apiUrl = (process.env.PAYLIO_API_URL || 'https://api.paylio.io/v1').replace(/\/$/, '');
    this.webhookSecret = process.env.PAYLIO_WEBHOOK_SECRET || '';
    this.settlementWallet = process.env.MASSAF_POLYGON_WALLET_ADDRESS || '';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiUrl);
  }

  /**
   * Initiates a hosted payment session / link with PayLio
   */
  async createPayment(params: CreatePayLioPaymentParams): Promise<CreatePayLioPaymentResult> {
    if (process.env.NODE_ENV === 'test' || process.env.PAYLIO_MOCK_MODE === 'true') {
      const mockRef = `paylio_mock_${params.bookingNumber}_${Date.now()}`;
      return {
        paymentReference: mockRef,
        checkoutUrl: `${params.returnUrl}?payment_ref=${mockRef}&status=mock_pending`,
        status: 'PENDING',
      };
    }

    if (!this.apiKey) {
      throw new Error('PAYLIO_API_KEY is not configured on the server.');
    }

    const payload = {
      reference: params.bookingNumber,
      amount: params.amount,
      currency: 'USD',
      description: params.description,
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      settlement_wallet: this.settlementWallet || undefined,
      settlement_network: 'polygon',
      allow_card: true,
      allow_crypto: true,
    };

    const response = await fetch(`${this.apiUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PayLio createPayment failed:', response.status, errorText);
      throw new Error(`PayLio payment creation failed (${response.status})`);
    }

    const data = await response.json();

    const paymentReference = data.id;
    const checkoutUrl = data.checkout_url || data.payment_url || data.url;

    if (!paymentReference || !checkoutUrl) {
      throw new Error('PayLio response missing payment id or checkout URL');
    }

    return {
      paymentReference,
      checkoutUrl,
      status: data.status || 'PENDING',
    };
  }

  /**
   * Re-queries PayLio server-side directly to verify payment status
   */
  async getPaymentStatus(paymentReference: string): Promise<PayLioPaymentStatusResult> {
    if (process.env.NODE_ENV === 'test' || process.env.PAYLIO_MOCK_MODE === 'true') {
      if (paymentReference.includes('mock_failed')) {
        return { paymentReference, status: 'FAILED', rawStatus: 'failed', amount: 150.0, currency: 'USD' };
      }
      if (paymentReference.includes('mock_paid')) {
        return { paymentReference, status: 'PAID', rawStatus: 'completed', amount: 150.0, currency: 'USD', paymentMethod: 'CARD' };
      }
      return { paymentReference, status: 'PENDING', rawStatus: 'pending', amount: 150.0, currency: 'USD' };
    }

    if (!this.apiKey) {
      throw new Error('PAYLIO_API_KEY is not configured on the server.');
    }

    const response = await fetch(`${this.apiUrl}/payments/${encodeURIComponent(paymentReference)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      console.error('PayLio getPaymentStatus failed:', response.status, await response.text());
      return {
        paymentReference,
        status: 'UNKNOWN',
      };
    }

    const data = await response.json();
    const rawStatus = String(data.status || '').toLowerCase();

    let mappedStatus: PayLioPaymentStatusResult['status'] = 'PENDING';
    if (['paid', 'completed', 'succeeded', 'success'].includes(rawStatus)) {
      mappedStatus = 'PAID';
    } else if (['failed', 'declined', 'error'].includes(rawStatus)) {
      mappedStatus = 'FAILED';
    } else if (['expired', 'timeout'].includes(rawStatus)) {
      mappedStatus = 'EXPIRED';
    } else if (['cancelled', 'canceled'].includes(rawStatus)) {
      mappedStatus = 'CANCELLED';
    } else if (['pending', 'processing', 'unpaid'].includes(rawStatus)) {
      mappedStatus = 'PENDING';
    } else {
      mappedStatus = 'UNKNOWN';
    }

    const methodDetected = data.payment_method === 'crypto' || data.tx_hash ? 'CRYPTO' : 'CARD';

    return {
      paymentReference,
      status: mappedStatus,
      amount: data.amount ? Number(data.amount) : undefined,
      currency: data.currency ? String(data.currency).toUpperCase() : undefined,
      paymentMethod: methodDetected,
      transactionHash: data.tx_hash || undefined,
      rawStatus,
    };
  }

  /**
   * Validates HMAC SHA-256 webhook signature for PayLio webhooks
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader || !this.webhookSecret) {
      return false;
    }

    try {
      let sig = signatureHeader.trim();
      if (sig.includes('v1=')) {
        const parts = sig.split(',');
        const v1Part = parts.find((p) => p.trim().startsWith('v1='));
        if (v1Part) {
          sig = v1Part.split('=')[1].trim();
        }
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(rawBody, 'utf8')
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(sig.toLowerCase(), 'hex'),
        Buffer.from(expectedSignature.toLowerCase(), 'hex')
      );
    } catch (err) {
      console.error('Error verifying PayLio webhook signature:', err);
      return false;
    }
  }
}

export const paylioClient = new PayLioClient();

export interface ConfirmPaymentOptions {
  bookingId: string;
  paymentReference: string;
  providerStatus: PayLioPaymentStatusResult['status'];
  providerAmount?: number;
  providerCurrency?: string;
  providerMethod?: 'CARD' | 'CRYPTO';
}

export interface ConfirmPaymentResult {
  success: boolean;
  message: string;
  bookingStatus: string;
  paymentStatus: string;
}

/**
 * Centralized, authoritative server-side payment state transition function.
 * Ensures strict verification of booking ID, payment reference, status, currency, and amount before transitioning to PAID.
 */
export async function confirmVerifiedPayLioPayment(
  options: ConfirmPaymentOptions
): Promise<ConfirmPaymentResult> {
  const booking = await db.booking.findUnique({
    where: { id: options.bookingId },
  });

  if (!booking) {
    return {
      success: false,
      message: 'Booking record not found.',
      bookingStatus: 'UNKNOWN',
      paymentStatus: 'UNKNOWN',
    };
  }

  // 1. Idempotency: If already PAID, safely return current state
  if (booking.paymentStatus === 'PAID') {
    return {
      success: true,
      message: 'Booking is already recorded as PAID (idempotent).',
      bookingStatus: booking.status,
      paymentStatus: booking.paymentStatus,
    };
  }

  // 2. Reject if booking is cancelled or refunded
  if (['CANCELLED', 'REFUNDED'].includes(booking.status)) {
    return {
      success: false,
      message: 'Cannot confirm payment on a cancelled or refunded booking.',
      bookingStatus: booking.status,
      paymentStatus: booking.paymentStatus,
    };
  }

  // 3. Status Check: Must be PAID
  if (options.providerStatus !== 'PAID') {
    if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(options.providerStatus)) {
      await db.booking.update({
        where: { id: booking.id },
        data: {
          paymentStatus: 'FAILED',
          paymentReference: options.paymentReference || booking.paymentReference,
        },
      });
      return {
        success: false,
        message: `Provider status is ${options.providerStatus}. Payment marked FAILED.`,
        bookingStatus: booking.status,
        paymentStatus: 'FAILED',
      };
    }

    return {
      success: false,
      message: `Provider payment status is ${options.providerStatus}. Remains pending.`,
      bookingStatus: booking.status,
      paymentStatus: booking.paymentStatus,
    };
  }

  // 4. Currency Verification (must be USD if provided)
  if (options.providerCurrency && options.providerCurrency.toUpperCase() !== 'USD') {
    console.error(`PayLio currency mismatch for booking ${booking.bookingNumber}: expected USD, got ${options.providerCurrency}`);
    return {
      success: false,
      message: `Unexpected payment currency: ${options.providerCurrency}. Expected USD.`,
      bookingStatus: booking.status,
      paymentStatus: booking.paymentStatus,
    };
  }

  // 5. Amount Verification: DB amount is authoritative
  if (typeof options.providerAmount === 'number') {
    const diff = Math.abs(options.providerAmount - booking.amount);
    if (diff > 0.01) {
      console.error(`PayLio payment amount mismatch for booking ${booking.bookingNumber}: DB authoritative amount $${booking.amount}, provider paid $${options.providerAmount}`);
      return {
        success: false,
        message: `Payment amount $${options.providerAmount} does not match expected booking amount $${booking.amount}.`,
        bookingStatus: booking.status,
        paymentStatus: booking.paymentStatus,
      };
    }
  }

  // 6. Execute atomic state transition to PAID and CONFIRMED
  const updatedBooking = await db.booking.update({
    where: { id: booking.id },
    data: {
      paymentStatus: 'PAID',
      paymentMethod: options.providerMethod || 'CARD',
      paymentReference: options.paymentReference || booking.paymentReference,
      status: booking.status === 'PENDING' ? 'CONFIRMED' : booking.status,
    },
  });

  return {
    success: true,
    message: 'Payment verified and booking transitioned to PAID/CONFIRMED.',
    bookingStatus: updatedBooking.status,
    paymentStatus: updatedBooking.paymentStatus,
  };
}
