import { PaymentService } from './service';
import { SystemPaymentSettings, PaymentProviderId } from './types';

export async function getPaymentSettings(): Promise<SystemPaymentSettings> {
  return PaymentService.getSettings();
}

export async function updatePaymentSettings(
  settings: SystemPaymentSettings
): Promise<{ success: boolean; error?: string }> {
  return PaymentService.updateSettings(settings);
}

export function getProviderConfigurations() {
  const adapters = PaymentService.getAllAdapters();
  const configMap: Record<
    PaymentProviderId,
    {
      id: PaymentProviderId;
      name: string;
      description: string;
      isConfigured: boolean;
      isImplemented: boolean;
      configFields: Record<string, { configured: boolean; label: string }>;
    }
  > = {} as Record<
    PaymentProviderId,
    {
      id: PaymentProviderId;
      name: string;
      description: string;
      isConfigured: boolean;
      isImplemented: boolean;
      configFields: Record<string, { configured: boolean; label: string }>;
    }
  >;

  for (const adapter of adapters) {
    configMap[adapter.id] = {
      id: adapter.id,
      name: adapter.name,
      description: adapter.description,
      isConfigured: adapter.isConfigured(),
      isImplemented: adapter.isImplemented(),
      configFields: adapter.getConfigurationInfo(),
    };
  }

  return configMap;
}
