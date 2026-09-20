'use client';

import React, { useState } from 'react';

interface TherapistAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
}

export function TherapistAuthModal({ isOpen, onClose, onVerified }: TherapistAuthModalProps) {
  const [step, setStep] = useState<'REQUEST' | 'VERIFY'>('REQUEST');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRequestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your therapist email address.');
      return;
    }

    setLoading(true);
    setError(null);
    setInfoMsg(null);

    try {
      const res = await fetch('/api/auth/therapist/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_token', email }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to request login verification token.');
        return;
      }

      setInfoMsg(data.message || 'Verification token sent.');
      if (data.token) {
        setToken(data.token);
      }
      setStep('VERIFY');
    } catch {
      setError('An error occurred while requesting token.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('Please enter your 64-character verification token.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/therapist/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_token', token }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid or expired verification token.');
        return;
      }

      onVerified();
      onClose();
    } catch {
      setError('An error occurred during verification.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
              🔑
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Therapist Portal Access</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-semibold"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs rounded-xl">
            {error}
          </div>
        )}

        {infoMsg && (
          <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl">
            {infoMsg}
          </div>
        )}

        {step === 'REQUEST' ? (
          <form onSubmit={handleRequestToken} className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Enter your registered therapist email address to receive a short-lived, single-use login verification token via Telegram or Email.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Therapist Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="therapist@example.com"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-emerald-500 outline-hidden"
              />
            </div>
            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-xs"
              >
                {loading ? 'Sending...' : 'Request Login Token'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifyToken} className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Enter the short-lived single-use verification token sent to your email or Telegram chat.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Verification Token
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token here"
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-hidden"
              />
            </div>
            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep('REQUEST')}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                ← Back to Request Token
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-xs"
              >
                {loading ? 'Verifying...' : 'Verify Token'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
