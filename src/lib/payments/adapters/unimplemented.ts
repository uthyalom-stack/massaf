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

export class UnimplementedAdapter implements PaymentProviderAdapter {
  readonly id: PaymentProviderId;
  readonly name: string;
  readonly description: string;
  readonly supportedCategories: PaymentMethodCategory[];
  private readonly envPrefix: string;

  constructor(
    id: PaymentProviderId,
    name: string,
    description: string,
    envPrefix: string,
    categories: PaymentMethodCategory[] = ['card']
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.envPrefix = envPrefix;
    this.supportedCategories = categories;
  }

  isConfigured(): boolean {
    const apiKey = process.env[`${this.envPrefix}_API_KEY`];
    return Boolean(apiKey && apiKey.trim().length > 0);
  }

  isImplemented(): boolean {
    return false;
  }

  getConfigurationInfo(): Record<string, ProviderConfigFieldInfo> {
    const apiKey = process.env[`${this.envPrefix}_API_KEY`];
    const webhookSecret = process.env[`${this.envPrefix}_WEBHOOK_SECRET`];
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
      error: `${this.name} provider integration is architected but currently unconfigured / not implemented pending official API documentation.`,
    };
  }

  async getPaymentStatus(_input: PaymentStatusInput): Promise<PaymentStatusResult> {
    return {
      success: false,
      status: 'UNKNOWN',
      error: `${this.name} status check is not implemented.`,
    };
  }

  async handleWebhook(_input: WebhookInput): Promise<WebhookResult> {
    return {
      success: false,
      error: `${this.name} webhook handler is not implemented.`,
      httpStatus: 501,
    };
  }
}

export const norpoAdapter = new UnimplementedAdapter('norpo', 'Norpo', 'Norpo payment gateway integration stub.', 'NORPO', ['card']);
export const btcpayAdapter = new UnimplementedAdapter('btcpay', 'BTCPay Server', 'BTCPay self-hosted crypto gateway stub.', 'BTCPAY', ['crypto']);
export const paymentoAdapter = new UnimplementedAdapter('paymento', 'Paymento', 'Paymento gateway integration stub.', 'PAYMENTO', ['card']);
export const nexapayAdapter = new UnimplementedAdapter('nexapay', 'NexaPay', 'NexaPay payment gateway integration stub.', 'NEXAPAY', ['card']);
