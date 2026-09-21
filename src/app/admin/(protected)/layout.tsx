import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getVerifiedAdminSession } from '@/lib/auth-session';

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getVerifiedAdminSession();
  if (!session) {
    redirect('/admin/login');
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
      {/* Main Admin Header / Nav */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo / Brand */}
            <div className="flex items-center gap-6">
              <Link href="/admin" className="flex items-center gap-2.5 group">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-black text-lg group-hover:bg-emerald-500 transition-colors">
                  M
                </div>
                <div className="flex flex-col">
                  <span className="font-extrabold text-white text-lg tracking-tight leading-none">
                    MASSAF
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold tracking-wider uppercase leading-tight">
                    Admin Portal
                  </span>
                </div>
              </Link>

              {/* Desktop Nav */}
              <nav className="hidden md:flex items-center space-x-1 pl-6 border-l border-slate-800">
                <Link
                  href="/admin"
                  className="px-3 py-2 rounded-md text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Dashboard
                </Link>
                <Link
                  href="/admin/therapists"
                  className="px-3 py-2 rounded-md text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Therapists
                </Link>
                <Link
                  href="/admin/bookings"
                  className="px-3 py-2 rounded-md text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Bookings
                </Link>
                <Link
                  href="/admin/reviews"
                  className="px-3 py-2 rounded-md text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Reviews
                </Link>
                <Link
                  href="/admin/marketing-links"
                  className="px-3 py-2 rounded-md text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Marketing Links
                </Link>
                <Link
                  href="/admin/settings"
                  className="px-3 py-2 rounded-md text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Settings
                </Link>
              </nav>
            </div>

            {/* Quick Actions / Session status / Link back to site */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 hidden sm:inline-block">
                Signed in as <strong className="text-slate-200">{session.email}</strong> ({session.role})
              </span>
              <form action={async () => {
                'use server';
                const { clearAdminSessionCookie } = await import('@/lib/auth-session');
                await clearAdminSessionCookie();
                redirect('/admin/login');
              }}>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-red-400 hover:bg-slate-800 transition-colors border border-slate-700"
                >
                  Sign Out
                </button>
              </form>
              <Link
                href="/"
                target="_blank"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors border border-slate-700"
              >
                <span>View Live Site</span>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="md:hidden border-t border-slate-800 px-4 py-2 flex items-center space-x-2 overflow-x-auto text-xs">
          <Link
            href="/admin"
            className="px-3 py-1.5 rounded-md font-medium text-slate-200 hover:bg-slate-800 shrink-0"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/therapists"
            className="px-3 py-1.5 rounded-md font-medium text-slate-200 hover:bg-slate-800 shrink-0"
          >
            Therapists
          </Link>
          <Link
            href="/admin/bookings"
            className="px-3 py-1.5 rounded-md font-medium text-slate-200 hover:bg-slate-800 shrink-0"
          >
            Bookings
          </Link>
          <Link
            href="/admin/reviews"
            className="px-3 py-1.5 rounded-md font-medium text-slate-200 hover:bg-slate-800 shrink-0"
          >
            Reviews
          </Link>
          <Link
            href="/admin/marketing-links"
            className="px-3 py-1.5 rounded-md font-medium text-slate-200 hover:bg-slate-800 shrink-0"
          >
            Marketing Links
          </Link>
          <Link
            href="/admin/settings"
            className="px-3 py-1.5 rounded-md font-medium text-slate-200 hover:bg-slate-800 shrink-0"
          >
            Settings
          </Link>
        </div>
      </header>

      {/* Admin Body Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      {/* Admin Footer */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 text-xs py-4 px-6 text-center">
        MASSAF Admin Console
      </footer>
    </div>
  );
}
