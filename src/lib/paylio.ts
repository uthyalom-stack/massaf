import crypto from 'crypto';

export interface CreatePayLioCheckoutParams {
  bookingId: string;
  bookingNumber: string;
  amount: number; // in USD
  description: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatePayLioCheckoutResult {
  paymentReference: string;
  checkoutUrl: string;
  status: string;
}

export interface PayLioPaymentStatusResult {
  paymentReference: string;
  status: 'PAID' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | 'UNKNOWN';
  amount?: number;
  currency?: string;
  transactionHash?: string;
  rawStatus?: string;
}

/**
 * Server-only PayLio API Client Utility
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
   * Initiates a hosted payment checkout session with PayLio
   */
  async createCheckoutSession(params: CreatePayLioCheckoutParams): Promise<CreatePayLioCheckoutResult> {
    // If running in test mode without real credentials, support test mock mode
    if (process.env.NODE_ENV === 'test' || process.env.PAYLIO_MOCK_MODE === 'true') {
      const mockRef = `paylio_mock_${params.bookingNumber}_${Date.now()}`;
      return {
        paymentReference: mockRef,
        checkoutUrl: `${params.returnUrl}?payment_ref=${mockRef}&status=mock_pending`,
        status: 'PENDING',
      };
    }

    if (!this.apiKey) {
      throw new Error('PayLio API Key (PAYLIO_API_KEY) is not configured.');
    }

    const payload = {
      reference: params.bookingNumber,
      booking_id: params.bookingId,
      amount: params.amount,
      currency: 'USD',
      description: params.description,
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      settlement_wallet: this.settlementWallet || undefined,
      network: 'polygon',
    };

    const response = await fetch(`${this.apiUrl}/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Api-Key': this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PayLio createCheckoutSession failed:', response.status, errorText);
      throw new Error(`PayLio checkout creation failed (${response.status})`);
    }

    const data = await response.json();

    const paymentReference = data.id || data.payment_id || data.reference;
    const checkoutUrl = data.checkout_url || data.url;

    if (!paymentReference || !checkoutUrl) {
      throw new Error('PayLio response missing payment reference or checkout URL');
    }

    return {
      paymentReference,
      checkoutUrl,
      status: data.status || 'PENDING',
    };
  }

  /**
   * Re-queries PayLio server-side directly to verify the current payment status
   */
  async getPaymentStatus(paymentReference: string): Promise<PayLioPaymentStatusResult> {
    if (process.env.NODE_ENV === 'test' || process.env.PAYLIO_MOCK_MODE === 'true') {
      if (paymentReference.includes('mock_failed')) {
        return { paymentReference, status: 'FAILED', rawStatus: 'failed' };
      }
      if (paymentReference.includes('mock_paid')) {
        return { paymentReference, status: 'PAID', rawStatus: 'completed' };
      }
      return { paymentReference, status: 'PENDING', rawStatus: 'pending' };
    }

    if (!this.apiKey) {
      throw new Error('PayLio API Key (PAYLIO_API_KEY) is not configured.');
    }

    const response = await fetch(`${this.apiUrl}/payments/${encodeURIComponent(paymentReference)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Api-Key': this.apiKey,
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
    const rawStatus = (data.status || data.payment_status || '').toLowerCase();

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

    return {
      paymentReference,
      status: mappedStatus,
      amount: data.amount ? Number(data.amount) : undefined,
      currency: data.currency,
      transactionHash: data.tx_hash || data.transaction_hash || data.hash,
      rawStatus,
    };
  }

  /**
   * Validates HMAC webhook signature for PayLio webhooks
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader || !this.webhookSecret) {
      return false;
    }

    try {
      // Support signature header formats: "t=123,v1=abc..." or plain hex string
      let sig = signatureHeader;
      if (signatureHeader.includes('v1=')) {
        const parts = signatureHeader.split(',');
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
