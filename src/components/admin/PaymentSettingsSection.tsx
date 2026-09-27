'use client';

import React, { useState } from 'react';
import { updatePaymentSettingsAction } from '@/app/admin/actions';
import { SystemPaymentSettings, PaymentProviderId } from '@/lib/payments/types';

export interface ProviderConfigInfo {
  id: PaymentProviderId;
  name: string;
  description: string;
  isConfigured: boolean;
  isImplemented: boolean;
  configFields: Record<string, { configured: boolean; label: string }>;
}

export interface PaymentSettingsSectionProps {
  initialSettings: SystemPaymentSettings;
  configurations: Record<PaymentProviderId, ProviderConfigInfo>;
}

const providerOrder: PaymentProviderId[] = [
  'paymegate',
  'norpo',
  'nowpayments',
  'btcpay',
  'paymento',
  'nexapay',
  'paylio',
  'giftcard',
];

export function PaymentSettingsSection({
  initialSettings,
  configurations,
}: PaymentSettingsSectionProps) {
  const [settings, setSettings] = useState<SystemPaymentSettings>(initialSettings);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleToggle = (id: PaymentProviderId) => {
    setSettings((prev) => {
      const current = prev.providers[id];
      if (!current) return prev;

      const newEnabled = !current.enabled;

      // Rule: Cannot disable default provider directly
      if (!newEnabled && prev.defaultProviderId === id) {
        setMsg({
          type: 'error',
          text: `Cannot disable '${configurations[id]?.name || id}' because it is set as the default provider. Please set another provider as default first.`,
        });
        return prev;
      }

      setMsg(null);
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [id]: {
            ...current,
            enabled: newEnabled,
          },
        },
      };
    });
  };

  const handleDefaultChange = (id: PaymentProviderId) => {
    const config = configurations[id];
    const providerSetting = settings.providers[id];

    if (!providerSetting || !providerSetting.enabled) {
      setMsg({
        type: 'error',
        text: `Cannot select '${config?.name || id}' as default because it is disabled. Enable it first.`,
      });
      return;
    }

    if (!config || !config.isImplemented || !config.isConfigured) {
      setMsg({
        type: 'error',
        text: `Cannot select '${config?.name || id}' as default because it is not fully configured and operational.`,
      });
      return;
    }

    setMsg(null);
    setSettings((prev) => ({
      ...prev,
      defaultProviderId: id,
    }));
  };

  const handlePriorityChange = (id: PaymentProviderId, newPriority: number) => {
    setSettings((prev) => {
      const current = prev.providers[id];
      if (!current) return prev;
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [id]: {
            ...current,
            priority: newPriority,
          },
        },
      };
    });
  };

  const handleSave = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await updatePaymentSettingsAction(settings);
      if (res.success) {
        setMsg({ type: 'success', text: 'Payment provider settings saved successfully!' });
      } else {
        setMsg({ type: 'error', text: res.error || 'Failed to save payment settings.' });
      }
    } catch (err: unknown) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'An error occurred while saving.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
            Payment Providers & Gateway Architecture
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage provider enablement, priority order, default selection, and server configuration health.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          aria-busy={loading}
          onClick={handleSave}
          className="px-4 py-2 min-h-[38px] bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Saving Settings...</span>
            </>
          ) : (
            <span>Save Payment Settings</span>
          )}
        </button>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between ${
            msg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <span>{msg.text}</span>
          <button type="button" onClick={() => setMsg(null)} className="font-bold underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Default Provider Selector */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
          Default Active Checkout Provider
        </label>
        <p className="text-[11px] text-slate-500">
          The primary provider presented to customers. Must be enabled, implemented, and fully configured.
        </p>
        <select
          value={settings.defaultProviderId}
          onChange={(e) => handleDefaultChange(e.target.value as PaymentProviderId)}
          className="w-full sm:w-auto px-3.5 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-emerald-600 focus:border-emerald-600"
        >
          {providerOrder.map((id) => {
            const config = configurations[id];
            const pSetting = settings.providers[id];
            const isSelectable = pSetting?.enabled && config?.isImplemented && config?.isConfigured;
            return (
              <option key={id} value={id} disabled={!isSelectable}>
                {config?.name || id} {!isSelectable ? '(Disabled / Not Configured)' : ''}
              </option>
            );
          })}
        </select>
      </div>

      {/* Provider List */}
      <div className="space-y-4">
        <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
          Configured Provider Switches & Priority
        </h3>

        <div className="grid grid-cols-1 gap-3">
          {providerOrder.map((id) => {
            const config = configurations[id];
            const pSetting = settings.providers[id] || { id, enabled: false, priority: 99 };
            const isDefault = settings.defaultProviderId === id;

            let statusBadge = (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                Disabled
              </span>
            );

            if (pSetting.enabled) {
              if (config?.isImplemented && config?.isConfigured) {
                statusBadge = (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Enabled + Configured
                  </span>
                );
              } else if (!config?.isImplemented) {
                statusBadge = (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                    Enabled, but unavailable to customers because integration is not implemented.
                  </span>
                );
              } else {
                statusBadge = (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-200">
                    Enabled + Not Configured
                  </span>
                );
              }
            }

            return (
              <div
                key={id}
                className={`p-4 rounded-xl border transition-all ${
                  pSetting.enabled
                    ? 'bg-white border-slate-200 shadow-2xs'
                    : 'bg-slate-50/70 border-slate-200 opacity-80'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-900 text-sm">
                        {config?.name || id}
                      </span>
                      {isDefault && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-700 text-white shadow-2xs">
                          Default Provider
                        </span>
                      )}
                      {statusBadge}
                    </div>
                    <p className="text-xs text-slate-500 leading-normal">
                      {config?.description || 'Payment gateway provider adapter.'}
                    </p>

                    {/* Server Configuration Fields Audit */}
                    {config?.configFields && Object.keys(config.configFields).length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {Object.entries(config.configFields).map(([fKey, fInfo]) => (
                          <span
                            key={fKey}
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              fInfo.configured
                                ? 'bg-slate-50 text-slate-700 border-slate-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {fInfo.label}: {fInfo.configured ? 'Configured' : 'Missing'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    {/* Priority Selector */}
                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Priority:</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={pSetting.priority}
                        onChange={(e) => handlePriorityChange(id, parseInt(e.target.value) || 1)}
                        className="w-14 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-center text-slate-900"
                      />
                    </div>

                    {/* Enable / Disable Switch Button */}
                    <button
                      type="button"
                      onClick={() => handleToggle(id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
                        pSetting.enabled
                          ? 'bg-rose-100 hover:bg-rose-200 text-rose-800'
                          : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                      }`}
                    >
                      {pSetting.enabled ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
