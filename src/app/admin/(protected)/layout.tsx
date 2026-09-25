import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { AdminNotificationBell } from '@/components/admin/AdminNotificationBell';

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getVerifiedAdminSession();
  if (!session) {
    redirect('/admin/login');
  }

  const isMarketer = session.role === 'STAFF';

  const navSections = isMarketer
    ? [
        {
          title: 'PORTAL',
          links: [
            { label: 'Dashboard', href: '/admin/marketer' },
            { label: 'Leaderboard', href: '/admin/leaderboard' },
          ],
        },
      ]
    : [
        {
          title: 'OPERATIONS',
          links: [
            { label: 'Dashboard', href: '/admin' },
            { label: 'Bookings', href: '/admin/bookings' },
            { label: 'Payments', href: '/admin/payments' },
            { label: 'Customers', href: '/admin/customers' },
            { label: 'Notifications', href: '/admin/notifications' },
          ],
        },
        {
          title: 'PEOPLE',
          links: [
            { label: 'Therapists', href: '/admin/therapists' },
            { label: 'Reviews', href: '/admin/reviews' },
            { label: 'Testimonials', href: '/admin/testimonials' },
          ],
        },
        {
          title: 'MARKETING',
          links: [
            { label: 'Marketers', href: '/admin/marketers' },
            { label: 'Marketing Links', href: '/admin/marketing-links' },
            { label: 'Leaderboard', href: '/admin/leaderboard' },
          ],
        },
        {
          title: 'CONTENT',
          links: [
            { label: 'Content CMS', href: '/admin/content' },
          ],
        },
        {
          title: 'SYSTEM',
          links: [
            { label: 'Services', href: '/admin/services' },
            { label: 'Categories', href: '/admin/categories' },
            { label: 'Settings', href: '/admin/settings' },
            { label: 'Audit Log', href: '/admin/audit-log' },
            ...(session.role === 'SUPER_ADMIN' ? [{ label: 'Admin Users', href: '/admin/admin-users' }] : []),
          ],
        },
      ];

  const flatNavLinks = navSections.flatMap((s) => s.links);

  const brandHref = isMarketer ? '/admin/marketer' : '/admin';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
      {/* Main Admin Header / Nav */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo / Brand */}
            <div className="flex items-center gap-6">
              <Link href={brandHref} className="flex items-center gap-2.5 group">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-black text-lg group-hover:bg-emerald-500 transition-colors">
                  M
                </div>
                <div className="flex flex-col">
                  <span className="font-extrabold text-white text-lg tracking-tight leading-none">
                    MASSAF
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold tracking-wider uppercase leading-tight">
                    {isMarketer ? 'Marketer Portal' : 'Admin Portal'}
                  </span>
                </div>
              </Link>

              {/* Desktop Nav */}
              <nav className="hidden lg:flex items-center space-x-1 pl-6 border-l border-slate-800">
                {flatNavLinks.slice(0, 7).map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>

            {/* Quick Actions / Notifications / Session status / Link back to site */}
            <div className="flex items-center gap-3">
              {!isMarketer && <AdminNotificationBell />}

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

        {/* Secondary Sub-Header Navigation Bar */}
        <div className="border-t border-slate-800 bg-slate-950/80 px-4 py-2 overflow-x-auto text-xs flex items-center gap-6">
          {navSections.map((sec) => (
            <div key={sec.title} className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase">
                {sec.title}:
              </span>
              <div className="flex items-center gap-1">
                {sec.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="px-2 py-1 rounded-md font-medium text-slate-300 hover:text-white hover:bg-slate-800 shrink-0 transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </header>

      {/* Admin Body Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>

      {/* Admin Footer */}
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 text-xs py-4 px-6 text-center">
        MASSAF Platform Console
      </footer>
    </div>
  );
}
