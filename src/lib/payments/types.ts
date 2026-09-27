export type PaymentProviderId =
  | 'paylio'
  | 'nowpayments'
  | 'giftcard'
  | 'paymegate'
  | 'norpo'
  | 'btcpay'
  | 'paymento'
  | 'nexapay';

export type PaymentMethodCategory = 'card' | 'crypto' | 'giftcard' | 'manual' | 'wallet';

export type NormalizedPaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'UNKNOWN';

export interface PaymentCreationInput {
  bookingId: string;
  bookingNumber: string;
  amount: number; // Server-authoritative amount
  currency: string;
  customerEmail: string;
  customerName?: string;
  callbackUrl: string;
  successUrl?: string;
  cancelUrl?: string;
  checkoutToken?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentCreationResult {
  success: boolean;
  providerPaymentId?: string;
  checkoutUrl?: string;
  instructions?: string;
  error?: string;
  rawResponse?: unknown;
}

export interface PaymentStatusInput {
  bookingId: string;
  providerPaymentId: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentStatusResult {
  success: boolean;
  status: NormalizedPaymentStatus;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  error?: string;
  rawResponse?: unknown;
}

export interface WebhookInput {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  query?: Record<string, string | string[] | undefined>;
}

export interface NormalizedWebhookEvent {
  providerId: PaymentProviderId;
  providerPaymentId: string;
  bookingId?: string;
  bookingNumber?: string;
  status: NormalizedPaymentStatus;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  rawPayload?: unknown;
}

export interface WebhookResult {
  success: boolean;
  event?: NormalizedWebhookEvent;
  error?: string;
  httpStatus: number;
}

export interface ProviderConfigFieldInfo {
  configured: boolean;
  label: string;
}

export interface PaymentProviderAdapter {
  readonly id: PaymentProviderId;
  readonly name: string;
  readonly description: string;
  readonly supportedCategories: PaymentMethodCategory[];

  /**
   * Returns true if required server-side environment variables / credentials exist.
   */
  isConfigured(): boolean;

  /**
   * Returns true if actual API logic is implemented for this provider.
   */
  isImplemented(): boolean;

  /**
   * Returns non-sensitive status info for admin settings UI (e.g. { "API Key": { configured: true, label: "API Key" } }).
   */
  getConfigurationInfo(): Record<string, ProviderConfigFieldInfo>;

  /**
   * Initiates payment creation with server-authoritative amount.
   */
  createPayment(input: PaymentCreationInput): Promise<PaymentCreationResult>;

  /**
   * Queries payment status directly from provider API server-to-server.
   */
  getPaymentStatus(input: PaymentStatusInput): Promise<PaymentStatusResult>;

  /**
   * Parses and verifies provider webhook/IPN payloads into a normalized event.
   */
  handleWebhook(input: WebhookInput): Promise<WebhookResult>;
}

export interface PaymentProviderSetting {
  id: PaymentProviderId;
  enabled: boolean;
  priority: number;
}

export interface SystemPaymentSettings {
  defaultProviderId: PaymentProviderId;
  providers: Record<PaymentProviderId, PaymentProviderSetting>;
  updatedAt?: string;
}
