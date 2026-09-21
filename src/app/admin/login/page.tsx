'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const [adminKey, setAdminKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminKey.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push('/admin');
        router.refresh();
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('A network error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-100">
      <div className="max-w-md w-full bg-slate-800 rounded-3xl border border-slate-700 p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white font-black text-2xl mx-auto shadow-md">
            M
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Admin Authentication</h1>
          <p className="text-slate-400 text-xs">
            Enter administrative API key to access the console
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs font-semibold text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
              Admin Secret Key
            </label>
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="••••••••••••••••"
              required
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !adminKey.trim()}
            className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <span>Login to Admin Console →</span>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-700/60 text-center">
          <Link href="/" className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors">
            &larr; Return to MASSAF Homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
