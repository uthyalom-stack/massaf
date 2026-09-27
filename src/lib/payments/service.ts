import { PaymentProviderAdapter, PaymentProviderId, SystemPaymentSettings } from './types';
import { PayLioAdapter } from './adapters/paylio';
import { NOWPaymentsAdapter } from './adapters/nowpayments';
import { GiftCardAdapter } from './adapters/giftcard';
import { PaymegateAdapter } from './adapters/paymegate';
import {
  norpoAdapter,
  btcpayAdapter,
  paymentoAdapter,
  nexapayAdapter,
} from './adapters/unimplemented';
import { db } from '@/lib/db';

const SETTINGS_CMS_KEY = 'payment_provider_settings_v1';

export const ALL_PROVIDER_IDS: PaymentProviderId[] = [
  'paymegate',
  'norpo',
  'nowpayments',
  'btcpay',
  'paymento',
  'nexapay',
  'paylio',
  'giftcard',
];

export const DEFAULT_SYSTEM_PAYMENT_SETTINGS: SystemPaymentSettings = {
  defaultProviderId: 'paylio',
  providers: {
    paymegate: { id: 'paymegate', enabled: false, priority: 1 },
    norpo: { id: 'norpo', enabled: false, priority: 2 },
    nowpayments: { id: 'nowpayments', enabled: true, priority: 3 },
    btcpay: { id: 'btcpay', enabled: false, priority: 4 },
    paymento: { id: 'paymento', enabled: false, priority: 5 },
    nexapay: { id: 'nexapay', enabled: false, priority: 6 },
    paylio: { id: 'paylio', enabled: true, priority: 7 },
    giftcard: { id: 'giftcard', enabled: true, priority: 8 },
  },
};

class PaymentServiceClass {
  private adapters: Map<PaymentProviderId, PaymentProviderAdapter> = new Map();

  constructor() {
    this.registerAdapter(new PayLioAdapter());
    this.registerAdapter(new NOWPaymentsAdapter());
    this.registerAdapter(new GiftCardAdapter());
    this.registerAdapter(new PaymegateAdapter());
    this.registerAdapter(norpoAdapter);
    this.registerAdapter(btcpayAdapter);
    this.registerAdapter(paymentoAdapter);
    this.registerAdapter(nexapayAdapter);
  }

  registerAdapter(adapter: PaymentProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(providerId: PaymentProviderId): PaymentProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  getAllAdapters(): PaymentProviderAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Retrieves server-side payment settings persisted in db via SiteContent.
   */
  async getSettings(): Promise<SystemPaymentSettings> {
    try {
      const row = await db.siteContent.findUnique({
        where: { key: SETTINGS_CMS_KEY },
      });

      if (!row || !row.content) {
        return DEFAULT_SYSTEM_PAYMENT_SETTINGS;
      }

      const parsed = JSON.parse(row.content) as SystemPaymentSettings;

      // Ensure all current provider keys exist in providers map
      const mergedProviders = { ...DEFAULT_SYSTEM_PAYMENT_SETTINGS.providers, ...parsed.providers };

      return {
        defaultProviderId: parsed.defaultProviderId || DEFAULT_SYSTEM_PAYMENT_SETTINGS.defaultProviderId,
        providers: mergedProviders,
        updatedAt: row.updatedAt.toISOString(),
      };
    } catch (err) {
      console.error('Error fetching system payment settings:', err);
      return DEFAULT_SYSTEM_PAYMENT_SETTINGS;
    }
  }

  /**
   * Updates system payment settings with validation.
   */
  async updateSettings(settings: SystemPaymentSettings): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Verify default provider exists
      const targetDefaultId = settings.defaultProviderId;
      const targetDefaultSetting = settings.providers[targetDefaultId];

      if (!targetDefaultSetting) {
        return { success: false, error: `Invalid default provider ID '${targetDefaultId}'.` };
      }

      // 2. Default provider MUST be enabled
      if (!targetDefaultSetting.enabled) {
        return { success: false, error: `The default provider '${targetDefaultId}' must be enabled.` };
      }

      // 3. Default provider MUST be configured & implemented
      const defaultAdapter = this.getAdapter(targetDefaultId);
      if (!defaultAdapter || !defaultAdapter.isImplemented() || !defaultAdapter.isConfigured()) {
        return {
          success: false,
          error: `The default provider '${targetDefaultId}' cannot be set as default because it is not fully configured and operational.`,
        };
      }

      // 4. Save to SiteContent
      await db.siteContent.upsert({
        where: { key: SETTINGS_CMS_KEY },
        update: {
          title: 'System Payment Provider Settings',
          content: JSON.stringify(settings),
        },
        create: {
          key: SETTINGS_CMS_KEY,
          title: 'System Payment Provider Settings',
          content: JSON.stringify(settings),
        },
      });

      return { success: true };
    } catch (err) {
      console.error('Error saving system payment settings:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to update settings.' };
    }
  }

  /**
   * Returns list of providers that are enabled AND configured AND implemented for customer checkout.
   */
  async getAvailableCustomerProviders(): Promise<
    Array<{
      id: PaymentProviderId;
      name: string;
      description: string;
      categories: string[];
      isDefault: boolean;
      priority: number;
    }>
  > {
    const settings = await this.getSettings();
    const result: Array<{
      id: PaymentProviderId;
      name: string;
      description: string;
      categories: string[];
      isDefault: boolean;
      priority: number;
    }> = [];

    for (const adapter of this.getAllAdapters()) {
      const providerSetting = settings.providers[adapter.id];
      const isEnabled = providerSetting?.enabled ?? false;

      if (isEnabled && adapter.isConfigured() && adapter.isImplemented()) {
        result.push({
          id: adapter.id,
          name: adapter.name,
          description: adapter.description,
          categories: adapter.supportedCategories,
          isDefault: settings.defaultProviderId === adapter.id,
          priority: providerSetting?.priority ?? 99,
        });
      }
    }

    // Sort by priority ascending
    result.sort((a, b) => a.priority - b.priority);
    return result;
  }
}

export const PaymentService = new PaymentServiceClass();
