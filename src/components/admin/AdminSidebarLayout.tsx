'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminNotificationBell } from '@/components/admin/AdminNotificationBell';

export interface NavSection {
  title: string;
  links: Array<{
    label: string;
    href: string;
  }>;
}

interface AdminSidebarLayoutProps {
  navSections: NavSection[];
  isMarketer: boolean;
  userEmail: string;
  userRole: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}

export function AdminSidebarLayout({
  navSections,
  isMarketer,
  userEmail,
  userRole,
  signOutAction,
  children,
}: AdminSidebarLayoutProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Close mobile drawer on route navigation
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const brandHref = isMarketer ? '/admin/marketer' : '/admin';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
      {/* Top Header Bar */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 h-16 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          {/* Mobile Drawer Hamburger */}
          <button
            type="button"
            onClick={() => setIsMobileOpen(!isMobileOpen)}
            className="lg:hidden p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            aria-label="Toggle mobile menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Desktop Sidebar Collapse Toggle */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="hidden lg:flex p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            aria-label="Collapse sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8M4 18h16" />
            </svg>
          </button>

          {/* Logo / Brand */}
          <Link href={brandHref} className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-black text-lg group-hover:bg-emerald-500 transition-colors">
              M
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-white text-lg tracking-tight leading-none">
                MASSAF
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold tracking-wider uppercase leading-tight">
                {isMarketer ? 'Marketer Portal' : 'Admin Console'}
              </span>
            </div>
          </Link>
        </div>

        {/* Right Side Controls */}
        <div className="flex items-center gap-3">
          {!isMarketer && <AdminNotificationBell />}

          <span className="text-xs text-slate-400 hidden sm:inline-block">
            Signed in as <strong className="text-slate-200">{userEmail}</strong> ({userRole})
          </span>

          <form action={signOutAction}>
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-red-400 hover:bg-slate-800 transition-colors border border-slate-700 cursor-pointer"
            >
              Sign Out
            </button>
          </form>

          <Link
            href="/"
            target="_blank"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors border border-slate-700"
          >
            <span>View Live Site</span>
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>
        </div>
      </header>

      {/* Main Body Shell: Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Mobile Backdrop */}
        {isMobileOpen && (
          <div
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/60 lg:hidden backdrop-blur-xs"
          />
        )}

        {/* Responsive Sidebar (Mobile Slide-over & Desktop Collapsible) */}
        <aside
          className={`bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col transition-all duration-200 z-50 fixed lg:static inset-y-0 left-0 ${
            isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'
          } ${isCollapsed ? 'lg:w-16' : 'lg:w-64'}`}
        >
          <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
            {navSections.map((section) => (
              <div key={section.title} className="space-y-1">
                {!isCollapsed && (
                  <h3 className="px-3 text-[10px] font-black uppercase tracking-wider text-emerald-400">
                    {section.title}
                  </h3>
                )}
                {isCollapsed && (
                  <div className="h-px bg-slate-800 my-2 mx-1" />
                )}

                {section.links.map((link) => {
                  const isActive = pathname === link.href || (link.href !== '/admin' && pathname.startsWith(link.href));
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      title={isCollapsed ? link.label : undefined}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-xs font-bold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      } ${isCollapsed ? 'justify-center px-2' : ''}`}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0 bg-current opacity-70" />
                      {!isCollapsed && <span>{link.label}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-slate-800 text-[11px] text-slate-500 text-center">
            {!isCollapsed ? 'MASSAF Platform v1.0' : 'M'}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
