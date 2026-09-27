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

export class PaymegateAdapter implements PaymentProviderAdapter {
  readonly id: PaymentProviderId = 'paymegate';
  readonly name = 'Paymegate';
  readonly description = 'Paymegate Payment Gateway (Primary provider architecture stub).';
  readonly supportedCategories: PaymentMethodCategory[] = ['card'];

  isConfigured(): boolean {
    const apiKey = process.env.PAYMEGATE_API_KEY;
    return Boolean(apiKey && apiKey.trim().length > 0);
  }

  isImplemented(): boolean {
    // Official Paymegate API integration documentation pending / not verified in repo.
    return false;
  }

  getConfigurationInfo(): Record<string, ProviderConfigFieldInfo> {
    const apiKey = process.env.PAYMEGATE_API_KEY;
    const webhookSecret = process.env.PAYMEGATE_WEBHOOK_SECRET;
    return {
      apiKey: {
        label: 'API Key',
        configured: Boolean(apiKey && apiKey.trim().length > 0),
      },
      webhookSecret: {
        label: 'Webhook Secret',
        configured: Boolean(webhookSecret && webhookSecret.trim().length > 0),
      },
    };
  }

  async createPayment(_input: PaymentCreationInput): Promise<PaymentCreationResult> {
    return {
      success: false,
      error: 'Paymegate provider integration is architected but currently unconfigured / not implemented pending official API specification.',
    };
  }

  async getPaymentStatus(_input: PaymentStatusInput): Promise<PaymentStatusResult> {
    return {
      success: false,
      status: 'UNKNOWN',
      error: 'Paymegate status check is not implemented.',
    };
  }

  async handleWebhook(_input: WebhookInput): Promise<WebhookResult> {
    return {
      success: false,
      error: 'Paymegate webhook handler is not implemented.',
      httpStatus: 501,
    };
  }
}
