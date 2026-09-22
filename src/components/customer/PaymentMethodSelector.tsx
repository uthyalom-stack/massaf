'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface PaymentMethodSelectorProps {
  bookingId: string;
  bookingNumber: string;
  amount: number;
  customerEmail?: string;
  customerName?: string;
  onSuccessRedirect?: (url: string) => void;
}

export function PaymentMethodSelector({
  bookingId,
  bookingNumber,
  amount,
  customerEmail,
  customerName,
  onSuccessRedirect,
}: PaymentMethodSelectorProps) {
  const router = useRouter();
  const [selectedMethod, setSelectedMethod] = useState<'paylio' | 'nowpayments' | 'giftcard'>('paylio');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Gift card form fields
  const [giftCardType, setGiftCardType] = useState('Visa Gift Card');
  const [giftCardCode, setGiftCardCode] = useState('');
  const [giftCardValue, setGiftCardValue] = useState(String(amount));
  const [giftCardNotes, setGiftCardNotes] = useState('');

  const handlePayLioPayment = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/payments/paylio/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, bookingNumber }),
      });

      const data = await res.json();
      if (res.ok && data.checkoutUrl) {
        if (onSuccessRedirect) {
          onSuccessRedirect(data.checkoutUrl);
        } else {
          window.location.href = data.checkoutUrl;
        }
      } else {
        setErrorMsg(data.error || 'Failed to initialize PayLio payment. Please try again or choose another payment method.');
      }
    } catch (err: unknown) {
      console.error('PayLio payment error:', err);
      setErrorMsg('A network error occurred while initiating PayLio payment.');
    } finally {
      setLoading(false);
    }
  };

  const handleNowPaymentsPayment = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/payments/nowpayments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, bookingNumber }),
      });

      const data = await res.json();
      if (res.ok && data.invoiceUrl) {
        if (onSuccessRedirect) {
          onSuccessRedirect(data.invoiceUrl);
        } else {
          window.location.href = data.invoiceUrl;
        }
      } else {
        setErrorMsg(data.error || 'Failed to initialize crypto checkout with NOWPayments.');
      }
    } catch (err: unknown) {
      console.error('NOWPayments error:', err);
      setErrorMsg('A network error occurred while setting up crypto payment.');
    } finally {
      setLoading(false);
    }
  };

  const handleGiftCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    if (!giftCardCode.trim() || giftCardCode.trim().length < 4) {
      setErrorMsg('Please enter a valid gift card number or claim code.');
      setLoading(false);
      return;
    }

    const val = parseFloat(giftCardValue);
    if (isNaN(val) || val <= 0) {
      setErrorMsg('Please enter a valid positive dollar amount.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/payments/gift-card/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          cardType: giftCardType,
          cardCode: giftCardCode.trim(),
          declaredValue: val,
          notes: giftCardNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.redirectUrl) {
        if (onSuccessRedirect) {
          onSuccessRedirect(data.redirectUrl);
        } else {
          router.push(data.redirectUrl);
        }
      } else {
        setErrorMsg(data.error || 'Failed to submit gift card for verification.');
      }
    } catch (err: unknown) {
      console.error('Gift card submission error:', err);
      setErrorMsg('A network error occurred while submitting gift card details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black text-slate-900 tracking-tight">
          Select Payment Method
        </h2>
        <p className="text-slate-600 text-xs sm:text-sm mt-1">
          Choose how you would like to complete payment for booking <strong className="font-mono text-slate-900">{bookingNumber}</strong> (${amount.toFixed(2)} USD).
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex justify-between items-center">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Payment Method Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Option 1: PayLio */}
        <button
          type="button"
          onClick={() => setSelectedMethod('paylio')}
          className={`p-5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
            selectedMethod === 'paylio'
              ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20 shadow-xs'
              : 'border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300'
          }`}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-900 text-sm">PayLio</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                Card / Instant
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pay securely with Credit/Debit card or Apple Pay via PayLio hosted checkout.
            </p>
          </div>
          <div className="pt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <span>Select PayLio</span>
            <span>&rarr;</span>
          </div>
        </button>

        {/* Option 2: NOWPayments Crypto */}
        <button
          type="button"
          onClick={() => setSelectedMethod('nowpayments')}
          className={`p-5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
            selectedMethod === 'nowpayments'
              ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20 shadow-xs'
              : 'border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300'
          }`}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-900 text-sm">Crypto — NOWPayments</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-900">
                Crypto Wallet
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pay directly from your crypto wallet using Bitcoin, Ethereum, USDT, Solana, and other supported cryptocurrencies.
            </p>
          </div>
          <div className="pt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <span>Select Crypto</span>
            <span>&rarr;</span>
          </div>
        </button>

        {/* Option 3: Gift Card */}
        <button
          type="button"
          onClick={() => setSelectedMethod('giftcard')}
          className={`p-5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
            selectedMethod === 'giftcard'
              ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20 shadow-xs'
              : 'border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300'
          }`}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-slate-900 text-sm">Gift Card</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-900">
                Manual Review
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Submit a Visa, Spafinder, or brand gift card for manual verification by MASSAF admins.
            </p>
          </div>
          <div className="pt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <span>Select Gift Card</span>
            <span>&rarr;</span>
          </div>
        </button>
      </div>

      {/* Selected Method Panel */}
      <div className="pt-4 border-t border-slate-100">
        {selectedMethod === 'paylio' && (
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 space-y-4">
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 text-sm">PayLio Card Checkout</h3>
              <p className="text-xs text-slate-600">
                You will be redirected to PayLio&apos;s secure hosted checkout page to complete your payment of <strong>${amount.toFixed(2)} USD</strong>.
              </p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handlePayLioPayment}
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              {loading ? 'Initializing PayLio...' : 'Proceed with PayLio →'}
            </button>
          </div>
        )}

        {selectedMethod === 'nowpayments' && (
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 space-y-4">
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 text-sm">NOWPayments Crypto Invoice</h3>
              <p className="text-xs text-slate-600">
                You will be redirected to NOWPayments to select your crypto wallet (Bitcoin, Ethereum, USDT, Solana, etc.) and complete payment.
              </p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleNowPaymentsPayment}
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              {loading ? 'Creating Crypto Invoice...' : 'Proceed with NOWPayments →'}
            </button>
          </div>
        )}

        {selectedMethod === 'giftcard' && (
          <form onSubmit={handleGiftCardSubmit} className="bg-slate-50 rounded-2xl p-6 border border-slate-200 space-y-4">
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 text-sm">Submit Gift Card Details</h3>
              <p className="text-xs text-slate-600">
                Enter your gift card details below for administrative verification.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Gift Card Type / Brand *
                </label>
                <select
                  value={giftCardType}
                  onChange={(e) => setGiftCardType(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600"
                >
                  <option value="Visa Gift Card">Visa Gift Card</option>
                  <option value="Mastercard Gift Card">Mastercard Gift Card</option>
                  <option value="Amex Gift Card">American Express Gift Card</option>
                  <option value="Spafinder">Spafinder Wellness Card</option>
                  <option value="Amazon">Amazon Gift Card</option>
                  <option value="Other">Other / Custom Gift Card</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Declared Value ($ USD) *
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="1"
                  value={giftCardValue}
                  onChange={(e) => setGiftCardValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Gift Card Number / Claim Code / PIN *
              </label>
              <input
                type="text"
                required
                value={giftCardCode}
                onChange={(e) => setGiftCardCode(e.target.value)}
                placeholder="e.g. 4000-1234-5678-9012 (PIN: 1234)"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Restricted to authorized MASSAF administrative review. Never displayed publicly.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Additional Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={giftCardNotes}
                onChange={(e) => setGiftCardNotes(e.target.value)}
                placeholder="Serial number or special instructions..."
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-sm rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              {loading ? 'Submitting Gift Card...' : 'Submit Gift Card for Verification →'}
            </button>
          </form>
        )}
      </div>

      {/* Fallback Contact Section */}
      <div className="pt-6 border-t border-slate-200 text-center space-y-2">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
          Don&apos;t see your preferred payment method?
        </h4>
        <p className="text-xs text-slate-600">
          Contact us directly to book manually or arrange custom payment details.
        </p>
        <p className="text-xs font-semibold text-emerald-800">
          Email: <a href="mailto:support@massaf.com" className="underline">support@massaf.com</a>
        </p>
      </div>
    </div>
  );
}
