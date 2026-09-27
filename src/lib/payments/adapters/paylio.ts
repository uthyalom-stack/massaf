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
  NormalizedPaymentStatus,
} from '../types';
import { paylioClient, confirmVerifiedPayLioPayment, PayLioPaymentStatusResult } from '@/lib/paylio';
import { db } from '@/lib/db';

export class PayLioAdapter implements PaymentProviderAdapter {
  readonly id: PaymentProviderId = 'paylio';
  readonly name = 'PayLio';
  readonly description = 'Instant Card & Wallet payments with Polygon USDC settlement.';
  readonly supportedCategories: PaymentMethodCategory[] = ['card', 'wallet'];

  isConfigured(): boolean {
    const apiKey = process.env.PAYLIO_API_KEY;
    const apiUrl = process.env.PAYLIO_API_URL;
    return Boolean(apiKey && apiKey.trim().length > 0 && apiUrl && apiUrl.trim().length > 0);
  }

  isImplemented(): boolean {
    return true;
  }

  getConfigurationInfo(): Record<string, ProviderConfigFieldInfo> {
    const apiKey = process.env.PAYLIO_API_KEY;
    const apiUrl = process.env.PAYLIO_API_URL;
    return {
      apiKey: {
        label: 'API Key',
        configured: Boolean(apiKey && apiKey.trim().length > 0),
      },
      apiUrl: {
        label: 'API URL',
        configured: Boolean(apiUrl && apiUrl.trim().length > 0),
      },
    };
  }

  async createPayment(input: PaymentCreationInput): Promise<PaymentCreationResult> {
    try {
      const res = await paylioClient.createWalletPayment({
        bookingId: input.bookingId,
        bookingNumber: input.bookingNumber,
        amount: input.amount,
        customerEmail: input.customerEmail,
        callbackUrl: input.callbackUrl,
        notes: `MASSAF Booking ${input.bookingNumber}`,
      });

      return {
        success: true,
        providerPaymentId: res.ipnToken,
        checkoutUrl: res.checkoutUrl,
        rawResponse: res,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create PayLio payment',
      };
    }
  }

  async getPaymentStatus(input: PaymentStatusInput): Promise<PaymentStatusResult> {
    try {
      const res = await paylioClient.getPaymentStatus(input.providerPaymentId);
      let normStatus: NormalizedPaymentStatus = 'UNKNOWN';

      if (res.status === 'PAID') normStatus = 'PAID';
      else if (res.status === 'PENDING') normStatus = 'PENDING';
      else if (res.status === 'CANCELLED') normStatus = 'CANCELLED';
      else if (res.status === 'FAILED') normStatus = 'FAILED';
      else if (res.status === 'EXPIRED') normStatus = 'EXPIRED';

      return {
        success: true,
        status: normStatus,
        amount: res.originalAmount,
        currency: res.currency,
        paymentMethod: res.paymentMethod,
        rawResponse: res,
      };
    } catch (err: unknown) {
      return {
        success: false,
        status: 'UNKNOWN',
        error: err instanceof Error ? err.message : 'Failed to get PayLio status',
      };
    }
  }

  async handleWebhook(input: WebhookInput): Promise<WebhookResult> {
    const query = input.query || {};
    const bookingIdParam = (Array.isArray(query.bookingId) ? query.bookingId[0] : query.bookingId) || undefined;
    const tokenParam = (Array.isArray(query.ipn_token) ? query.ipn_token[0] : query.ipn_token) ||
                       (Array.isArray(query.token) ? query.token[0] : query.token) ||
                       undefined;

    if (!tokenParam || tokenParam.trim().length === 0) {
      return {
        success: false,
        error: 'Missing required ipn_token parameter',
        httpStatus: 400,
      };
    }

    const suppliedToken = tokenParam.trim();

    // Verify token matches DB booking
    let booking = null;
    if (bookingIdParam) {
      booking = await db.booking.findUnique({ where: { id: bookingIdParam } });
    } else {
      booking = await db.booking.findFirst({ where: { paymentReference: suppliedToken } });
    }

    if (!booking) {
      return {
        success: false,
        error: 'Booking record not found',
        httpStatus: 404,
      };
    }

    if (!booking.paymentReference || booking.paymentReference !== suppliedToken) {
      return {
        success: false,
        error: 'Token mismatch',
        httpStatus: 400,
      };
    }

    // Server-to-Server status verification
    const statusRes = await this.getPaymentStatus({ bookingId: booking.id, providerPaymentId: suppliedToken });
    if (!statusRes.success || statusRes.status === 'UNKNOWN') {
      return {
        success: false,
        error: 'Failed server-to-server status verification with PayLio',
        httpStatus: 502,
      };
    }

    let paylioClientStatus: PayLioPaymentStatusResult['status'] = 'PENDING';
    if (statusRes.status === 'PAID') paylioClientStatus = 'PAID';
    else if (statusRes.status === 'CANCELLED') paylioClientStatus = 'CANCELLED';
    else if (statusRes.status === 'FAILED') paylioClientStatus = 'FAILED';
    else if (statusRes.status === 'EXPIRED') paylioClientStatus = 'EXPIRED';

    let paylioMethod: 'CARD' | 'CRYPTO' | undefined = undefined;
    if (statusRes.paymentMethod === 'CARD') paylioMethod = 'CARD';
    else if (statusRes.paymentMethod === 'CRYPTO') paylioMethod = 'CRYPTO';

    // Transition payment atomically
    const transition = await confirmVerifiedPayLioPayment({
      bookingId: booking.id,
      ipnToken: suppliedToken,
      providerStatus: paylioClientStatus,
      providerOriginalAmount: statusRes.amount,
      providerCurrency: statusRes.currency,
      providerMethod: paylioMethod,
    });

    if (!transition.success && statusRes.status !== 'FAILED') {
      return {
        success: false,
        error: transition.message,
        httpStatus: 400,
      };
    }

    return {
      success: true,
      event: {
        providerId: 'paylio',
        providerPaymentId: suppliedToken,
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        status: statusRes.status,
        amount: statusRes.amount,
        currency: statusRes.currency,
        paymentMethod: statusRes.paymentMethod,
        rawPayload: statusRes.rawResponse,
      },
      httpStatus: 200,
    };
  }
}
