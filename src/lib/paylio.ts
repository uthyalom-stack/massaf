import { db } from '@/lib/db';

export interface CreatePayLioWalletParams {
  bookingId: string;
  bookingNumber: string;
  amount: number; // in USD
  customerEmail?: string;
  callbackUrl: string;
  notes?: string;
}

export interface CreatePayLioWalletResult {
  paymentId: string;
  ipnToken: string;
  checkoutUrl: string;
  status: string;
  originalAmount?: number;
  amount?: number;
}

export interface PayLioPaymentStatusResult {
  paymentId?: string;
  ipnToken: string;
  status: 'PAID' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'UNKNOWN';
  rawStatus?: string;
  forwardStatus?: string;
  originalAmount?: number;
  amount?: number;
  currency?: string;
  paymentMethod?: 'CARD' | 'CRYPTO';
  transactionHash?: string;
}

/**
 * Server-only PayLio API Client Utility
 * Implements official PayLio REST API specs:
 * Base URL: https://paylio.org/api/v1
 * Create hosted checkout / wallet: POST /api/v1/wallet
 * Payment status check: GET /api/v1/payment-status?ipn_token=<TOKEN>
 * PayLio GET callback workflow
 */
export class PayLioClient {
  private apiKey: string;
  private apiUrl: string;
  private settlementWallet: string;

  constructor() {
    this.apiKey = process.env.PAYLIO_API_KEY || '';
    this.apiUrl = (process.env.PAYLIO_API_URL || 'https://paylio.org/api/v1').replace(/\/$/, '');
    this.settlementWallet = process.env.MASSAF_POLYGON_WALLET_ADDRESS || '';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiUrl && this.settlementWallet);
  }

  /**
   * Helper checking whether PayLio mock mode is allowed.
   * Mock mode is STRICTLY prohibited in production environments.
   */
  private isMockModeAllowed(): boolean {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return process.env.NODE_ENV === 'test' || process.env.PAYLIO_MOCK_MODE === 'true';
  }

  /**
   * Creates a hosted PayLio card-funded wallet/checkout payment link
   */
  async createWalletPayment(params: CreatePayLioWalletParams): Promise<CreatePayLioWalletResult> {
    if (this.isMockModeAllowed()) {
      const mockToken = `paylio_ipn_${params.bookingNumber}_${Date.now()}`;
      return {
        paymentId: `paylio_id_${Date.now()}`,
        ipnToken: mockToken,
        checkoutUrl: `${params.callbackUrl}&ipn_token=${mockToken}&status=paid`,
        status: 'unpaid',
        originalAmount: params.amount,
        amount: params.amount,
      };
    }

    if (!this.apiKey) {
      throw new Error('PAYLIO_API_KEY is not configured on the server.');
    }

    if (!this.settlementWallet) {
      throw new Error('MASSAF_POLYGON_WALLET_ADDRESS is not configured on the server.');
    }

    const payload = {
      address: this.settlementWallet,
      callback: params.callbackUrl,
      amount: params.amount,
      currency: 'USD',
      email: params.customerEmail || undefined,
      note: params.notes || `Booking ${params.bookingNumber}`,
      passFeeToCustomer: true,
    };

    const response = await fetch(`${this.apiUrl}/wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PayLio createWalletPayment failed:', response.status, errorText);
      throw new Error(`PayLio payment creation failed (${response.status})`);
    }

    const data = await response.json();

    const paymentId = data.payment_id || data.id;
    const ipnToken = data.ipn_token || data.token || paymentId;
    const checkoutUrl = data.checkout_url || data.payment_url || data.url;

    if (!ipnToken || !checkoutUrl) {
      throw new Error('PayLio response missing ipn_token or checkout URL');
    }

    return {
      paymentId,
      ipnToken,
      checkoutUrl,
      status: data.status || 'unpaid',
      originalAmount: data.original_amount ? Number(data.original_amount) : params.amount,
      amount: data.amount ? Number(data.amount) : params.amount,
    };
  }

  /**
   * Re-queries PayLio server-side directly to verify payment status using ipn_token
   */
  async getPaymentStatus(ipnToken: string): Promise<PayLioPaymentStatusResult> {
    if (this.isMockModeAllowed()) {
      if (ipnToken.includes('mock_failed')) {
        return {
          ipnToken,
          status: 'FAILED',
          rawStatus: 'canceled',
          forwardStatus: 'failed',
          originalAmount: 150.0,
          currency: 'USD',
        };
      }
      if (ipnToken.includes('mock_paid') || ipnToken.includes('paylio_ipn_')) {
        return {
          ipnToken,
          status: 'PAID',
          rawStatus: 'paid',
          forwardStatus: 'completed',
          originalAmount: 150.0,
          currency: 'USD',
          paymentMethod: 'CARD',
        };
      }
      return {
        ipnToken,
        status: 'PENDING',
        rawStatus: 'unpaid',
        forwardStatus: 'pending',
        originalAmount: 150.0,
        currency: 'USD',
      };
    }

    if (!this.apiKey) {
      throw new Error('PAYLIO_API_KEY is not configured on the server.');
    }

    const response = await fetch(`${this.apiUrl}/payment-status?ipn_token=${encodeURIComponent(ipnToken)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      console.error('PayLio getPaymentStatus failed:', response.status, await response.text());
      return {
        ipnToken,
        status: 'UNKNOWN',
      };
    }

    const data = await response.json();
    const rawStatus = String(data.status || '').toLowerCase();
    const forwardStatus = String(data.forward_status || '').toLowerCase();

    let mappedStatus: PayLioPaymentStatusResult['status'] = 'PENDING';
    if (rawStatus === 'paid' || forwardStatus === 'completed') {
      mappedStatus = 'PAID';
    } else if (rawStatus === 'canceled' || forwardStatus === 'failed') {
      mappedStatus = 'FAILED';
    } else if (rawStatus === 'expired') {
      mappedStatus = 'EXPIRED';
    } else if (rawStatus === 'unpaid' || forwardStatus === 'pending' || forwardStatus === 'processing') {
      mappedStatus = 'PENDING';
    } else {
      mappedStatus = 'UNKNOWN';
    }

    return {
      paymentId: data.payment_id || undefined,
      ipnToken,
      status: mappedStatus,
      rawStatus,
      forwardStatus,
      originalAmount: data.original_amount ? Number(data.original_amount) : data.amount ? Number(data.amount) : undefined,
      amount: data.amount ? Number(data.amount) : undefined,
      currency: data.currency ? String(data.currency).toUpperCase() : 'USD',
      paymentMethod: data.payment_type === 'crypto' || data.tx_hash ? 'CRYPTO' : 'CARD',
      transactionHash: data.tx_hash || undefined,
    };
  }
}

export const paylioClient = new PayLioClient();

export interface ConfirmPaymentOptions {
  bookingId: string;
  ipnToken: string;
  providerStatus: PayLioPaymentStatusResult['status'];
  providerOriginalAmount?: number;
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
 * Enforces:
 * 1. Booking existence
 * 2. Token ownership: booking.paymentReference MUST match supplied ipnToken
 * 3. Status === 'PAID'
 * 4. Currency === 'USD'
 * 5. Provider original_amount matches database booking amount
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

  // 1. Token Ownership Check: The PayLio ipn_token MUST match the stored booking.paymentReference
  if (!booking.paymentReference || booking.paymentReference !== options.ipnToken) {
    console.warn(`[SECURITY WARNING] Token ownership mismatch for booking ${booking.bookingNumber}. Stored token: "${booking.paymentReference}", supplied token: "${options.ipnToken}"`);
    return {
      success: false,
      message: 'PayLio ipn_token does not match the payment reference stored on this booking.',
      bookingStatus: booking.status,
      paymentStatus: booking.paymentStatus,
    };
  }

  // 2. Idempotency: If already PAID, safely return current state
  if (booking.paymentStatus === 'PAID') {
    return {
      success: true,
      message: 'Booking is already recorded as PAID (idempotent).',
      bookingStatus: booking.status,
      paymentStatus: booking.paymentStatus,
    };
  }

  // 3. Reject if booking is cancelled or refunded
  if (['CANCELLED', 'REFUNDED'].includes(booking.status)) {
    return {
      success: false,
      message: 'Cannot confirm payment on a cancelled or refunded booking.',
      bookingStatus: booking.status,
      paymentStatus: booking.paymentStatus,
    };
  }

  // 4. Status Check: Must be PAID
  if (options.providerStatus !== 'PAID') {
    if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(options.providerStatus)) {
      await db.booking.update({
        where: { id: booking.id },
        data: {
          paymentStatus: 'FAILED',
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

  // 5. Currency Verification
  if (options.providerCurrency && options.providerCurrency.toUpperCase() !== 'USD') {
    console.error(`PayLio currency mismatch for booking ${booking.bookingNumber}: expected USD, got ${options.providerCurrency}`);
    return {
      success: false,
      message: `Unexpected payment currency: ${options.providerCurrency}. Expected USD.`,
      bookingStatus: booking.status,
      paymentStatus: booking.paymentStatus,
    };
  }

  // 6. Amount Verification: DB booking amount vs provider original_amount
  if (typeof options.providerOriginalAmount === 'number') {
    const diff = Math.abs(options.providerOriginalAmount - booking.amount);
    if (diff > 0.01) {
      console.error(`PayLio amount mismatch for booking ${booking.bookingNumber}: DB authoritative amount $${booking.amount}, provider original_amount $${options.providerOriginalAmount}`);
      return {
        success: false,
        message: `Payment original_amount $${options.providerOriginalAmount} does not match expected booking amount $${booking.amount}.`,
        bookingStatus: booking.status,
        paymentStatus: booking.paymentStatus,
      };
    }
  }

  // 7. Execute atomic state transition to PAID and CONFIRMED
  const updatedBooking = await db.booking.update({
    where: { id: booking.id },
    data: {
      paymentStatus: 'PAID',
      paymentMethod: options.providerMethod || 'CARD',
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
