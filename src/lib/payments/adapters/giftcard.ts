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

export class GiftCardAdapter implements PaymentProviderAdapter {
  readonly id: PaymentProviderId = 'giftcard';
  readonly name = 'Gift Card';
  readonly description = 'Submit Visa, Mastercard, Amex, or Spafinder gift cards for manual admin review.';
  readonly supportedCategories: PaymentMethodCategory[] = ['giftcard', 'manual'];

  isConfigured(): boolean {
    return true; // Gift card processor is built-in and always configured
  }

  isImplemented(): boolean {
    return true;
  }

  getConfigurationInfo(): Record<string, ProviderConfigFieldInfo> {
    return {
      adminReviewQueue: {
        label: 'Admin Manual Review Queue',
        configured: true,
      },
    };
  }

  async createPayment(input: PaymentCreationInput): Promise<PaymentCreationResult> {
    return {
      success: true,
      providerPaymentId: `giftcard_${input.bookingId}`,
      instructions: `Please complete gift card photo submission for booking ${input.bookingNumber}.`,
    };
  }

  async getPaymentStatus(_input: PaymentStatusInput): Promise<PaymentStatusResult> {
    return {
      success: true,
      status: 'PENDING',
      paymentMethod: 'GIFT_CARD',
    };
  }

  async handleWebhook(_input: WebhookInput): Promise<WebhookResult> {
    return {
      success: false,
      error: 'Gift Card provider does not support automated external webhooks.',
      httpStatus: 400,
    };
  }
}
