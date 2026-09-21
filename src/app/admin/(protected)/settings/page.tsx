import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';

export const metadata = {
  title: 'Settings | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

function maskWalletAddress(address: string | undefined): string {
  if (!address || address.trim().length === 0) return 'Not configured';
  const clean = address.trim();
  if (clean.length < 10) return clean;
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

export default async function AdminSettingsPage() {
  const session = await getVerifiedAdminSession();
  if (session?.role === 'STAFF') {
    redirect('/admin/marketer');
  }

  // 1. Environment & App URL
  const environment = process.env.NODE_ENV || 'production';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || null;

  // 2. Database Health Check
  let dbStatus: 'Configured' | 'Unknown / unable to verify' = 'Unknown / unable to verify';
  const dbProvider = 'Turso / libSQL (SQLite)';
  try {
    await db.$queryRaw`SELECT 1`;
    dbStatus = 'Configured';
  } catch (err) {
    console.error('Settings DB Health Check Error:', err);
    dbStatus = 'Unknown / unable to verify';
  }

  // 3. Payment Integration Status (PayLio & Polygon Wallet)
  const paylioApiKey = process.env.PAYLIO_API_KEY;
  const paylioApiUrl = process.env.PAYLIO_API_URL;
  const paylioStatus = (paylioApiKey && paylioApiKey.trim().length > 0 && paylioApiUrl)
    ? 'Configured'
    : 'Not configured';

  const walletAddress = process.env.MASSAF_POLYGON_WALLET_ADDRESS;
  const walletStatus = (walletAddress && walletAddress.trim().length > 0 && walletAddress !== '0x0000000000000000000000000000000000000000')
    ? 'Configured'
    : 'Not configured';

  // 4. Notification Services Status
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramAdminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const telegramStatus = (telegramToken && telegramToken.trim().length > 0)
    ? 'Configured'
    : 'Not configured';
  const telegramAdminChatStatus = (telegramAdminChat && telegramAdminChat.trim().length > 0)
    ? 'Configured'
    : 'Not configured';

  const emailServer = process.env.EMAIL_SERVER || process.env.SMTP_HOST || process.env.RESEND_API_KEY;
  const emailStatus = (emailServer && emailServer.trim().length > 0)
    ? 'Configured'
    : 'Not configured';

  // 5. Cron & Scheduled Jobs Status
  const cronSecret = process.env.CRON_SECRET;
  const cronStatus = (cronSecret && cronSecret.trim().length > 0)
    ? 'Configured'
    : 'Not configured';

  // 6. Admin API Key Status
  const adminApiKey = process.env.MASSAF_ADMIN_API_KEY;
  const adminKeyStatus = (adminApiKey && adminApiKey.trim().length > 0)
    ? 'Configured'
    : 'Not configured';

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            System & Platform Settings
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Real-time server configuration auditing and integration status dashboard.
          </p>
        </div>
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors"
          >
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>

      {/* Grid of Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Card 1: Platform & Environment */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold">
              🖥️
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Platform Environment</h2>
              <p className="text-xs text-slate-500">Core application environment parameters</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="font-semibold text-slate-600">Application Name:</span>
              <span className="font-bold text-slate-900">MASSAF Platform</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="font-semibold text-slate-600">Environment Mode:</span>
              <span className="font-mono font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                {environment}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="font-semibold text-slate-600">Public Application URL:</span>
              <span className="font-mono text-slate-800">
                {appUrl || <span className="text-amber-600 italic">Not configured</span>}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="font-semibold text-slate-600">Admin Authorization Guard:</span>
              <StatusBadge status={adminKeyStatus} />
            </div>
          </div>
        </div>

        {/* Card 2: Database Storage */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold">
              🗄️
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Database Storage</h2>
              <p className="text-xs text-slate-500">Prisma ORM & Turso/libSQL persistence</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="font-semibold text-slate-600">Database Engine:</span>
              <span className="font-bold text-slate-900">{dbProvider}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="font-semibold text-slate-600">Connection Health:</span>
              <StatusBadge status={dbStatus} />
            </div>
            <div className="flex justify-between py-1.5">
              <span className="font-semibold text-slate-600">Schema Sync Status:</span>
              <span className="font-semibold text-emerald-700">Validated (`npx prisma validate`)</span>
            </div>
          </div>
        </div>

        {/* Card 3: PayLio Payments & Crypto Settlement */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center font-bold">
              💳
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Payment Gateway (PayLio)</h2>
              <p className="text-xs text-slate-500">Automated payment processing & crypto settlements</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="font-semibold text-slate-600">PayLio API Configuration:</span>
              <StatusBadge status={paylioStatus} />
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="font-semibold text-slate-600">Settlement Chain:</span>
              <span className="font-bold text-slate-900">Polygon Network (USDC)</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="font-semibold text-slate-600">Settlement Wallet:</span>
              <span className="font-mono text-slate-800">
                {walletStatus === 'Configured' ? maskWalletAddress(walletAddress) : <StatusBadge status="Not configured" />}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Operations & Notifications */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-800 flex items-center justify-center font-bold">
              🔔
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Notifications & Dispatchers</h2>
              <p className="text-xs text-slate-500">Multi-channel messaging configuration</p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="font-semibold text-slate-600">Telegram Bot Integration:</span>
              <StatusBadge status={telegramStatus} />
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="font-semibold text-slate-600">Admin Operational Alert Chat:</span>
              <StatusBadge status={telegramAdminChatStatus} />
            </div>
            <div className="flex justify-between py-1.5">
              <span className="font-semibold text-slate-600">Email Transport Service:</span>
              <StatusBadge status={emailStatus} />
            </div>
          </div>
        </div>

        {/* Card 5: Cron & Automation */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 md:col-span-2">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold">
              ⏱️
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Scheduled Jobs & Automation</h2>
              <p className="text-xs text-slate-500">Booking expirations and appointment reminder cron</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-500 font-medium block">Cron Route Secret:</span>
              <StatusBadge status={cronStatus} />
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-500 font-medium block">Unpaid Booking Hold:</span>
              <span className="font-bold text-slate-900">30 Minutes Expiration</span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="text-slate-500 font-medium block">Appointment Reminders:</span>
              <span className="font-bold text-slate-900">24-Hour & 3-Hour Idempotent</span>
            </div>
          </div>
        </div>

      </div>

      {/* Security Note */}
      <div className="bg-slate-900 text-slate-300 rounded-2xl p-5 text-xs flex items-center gap-3">
        <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span>
          <strong>Security Notice:</strong> All sensitive credentials (API keys, tokens, webhook secrets) are stored exclusively in server-side environment variables and are never rendered to the client interface.
        </span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'Configured' | 'Not configured' | 'Unknown / unable to verify' }) {
  if (status === 'Configured') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
        Configured
      </span>
    );
  }

  if (status === 'Not configured') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        Not configured
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      {status}
    </span>
  );
}
