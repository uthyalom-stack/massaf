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
import { nowPaymentsClient, processNowPaymentsIpn } from '@/lib/nowpayments';

export class NOWPaymentsAdapter implements PaymentProviderAdapter {
  readonly id: PaymentProviderId = 'nowpayments';
  readonly name = 'NOWPayments';
  readonly description = 'Accept Bitcoin, Ethereum, USDT, Solana, and 300+ cryptocurrencies.';
  readonly supportedCategories: PaymentMethodCategory[] = ['crypto'];

  isConfigured(): boolean {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    return Boolean(apiKey && apiKey.trim().length > 0);
  }

  isImplemented(): boolean {
    return true;
  }

  getConfigurationInfo(): Record<string, ProviderConfigFieldInfo> {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
    return {
      apiKey: {
        label: 'API Key',
        configured: Boolean(apiKey && apiKey.trim().length > 0),
      },
      ipnSecret: {
        label: 'IPN Secret Key',
        configured: Boolean(ipnSecret && ipnSecret.trim().length > 0),
      },
    };
  }

  async createPayment(input: PaymentCreationInput): Promise<PaymentCreationResult> {
    try {
      const invoice = await nowPaymentsClient.createInvoice({
        bookingId: input.bookingId,
        bookingNumber: input.bookingNumber,
        amount: input.amount,
        customerEmail: input.customerEmail,
        callbackUrl: input.callbackUrl,
        successUrl: input.successUrl || input.callbackUrl,
        cancelUrl: input.cancelUrl || input.callbackUrl,
      });

      return {
        success: true,
        providerPaymentId: invoice.invoiceId,
        checkoutUrl: invoice.invoiceUrl,
        rawResponse: invoice,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create NOWPayments crypto invoice',
      };
    }
  }

  async getPaymentStatus(input: PaymentStatusInput): Promise<PaymentStatusResult> {
    return {
      success: true,
      status: 'PENDING',
      error: `NOWPayments status polling for invoice/payment ${input.providerPaymentId} handled via IPN webhooks.`,
    };
  }

  async handleWebhook(input: WebhookInput): Promise<WebhookResult> {
    try {
      const sigHeader = input.headers['x-nowpayments-sig'];
      const signature = Array.isArray(sigHeader) ? sigHeader[0] : (sigHeader || '');

      const payload = (typeof input.body === 'object' && input.body !== null)
        ? (input.body as Record<string, unknown>)
        : {};

      const result = await processNowPaymentsIpn({
        payload,
        signature,
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Failed to process NOWPayments IPN',
          httpStatus: result.status,
        };
      }

      const paymentId = String(payload.payment_id || payload.invoice_id || '');
      const orderId = String(payload.order_id || '');
      const rawStatus = String(payload.payment_status || '').toLowerCase();

      let status: PaymentStatusResult['status'] = 'PENDING';
      if (['finished', 'confirmed'].includes(rawStatus)) {
        status = 'PAID';
      } else if (['failed', 'expired', 'refunded'].includes(rawStatus)) {
        status = rawStatus.toUpperCase() as PaymentStatusResult['status'];
      }

      return {
        success: true,
        event: {
          providerId: 'nowpayments',
          providerPaymentId: paymentId,
          bookingId: orderId,
          status,
          amount: Number(payload.price_amount || 0) || undefined,
          currency: String(payload.price_currency || '') || undefined,
          rawPayload: payload,
        },
        httpStatus: 200,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Error handling NOWPayments IPN',
        httpStatus: 500,
      };
    }
  }
}
