'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { NavItem } from '@/types/customer';

interface HeaderProps {
  navLinks: NavItem[];
}

export function Header({ navLinks }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo / Branding */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group focus:outline-none">
              <span className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center text-white font-bold text-lg shadow-sm group-hover:bg-emerald-800 transition-colors">
                M
              </span>
              <div className="flex flex-col">
                <span className="text-xl font-extrabold tracking-tight text-slate-900 group-hover:text-emerald-800 transition-colors">
                  MASSAF
                </span>
                <span className="text-[10px] font-semibold text-emerald-800 tracking-widest uppercase -mt-1">
                  Wellness & Therapy
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Main Navigation">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-slate-600 hover:text-emerald-800 transition-colors focus:outline-none focus:text-emerald-800"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Header Action CTA */}
          <div className="hidden md:flex items-center gap-4">
            <Link
              href="/find-a-therapist"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              Find a Therapist
            </Link>
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="flex md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors focus:outline-none cursor-pointer"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white/95 backdrop-blur-lg px-4 pt-2 pb-6 space-y-3">
          <nav className="flex flex-col space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2 rounded-lg text-base font-medium text-slate-700 hover:bg-slate-50 hover:text-emerald-800 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="pt-2">
            <Link
              href="/find-a-therapist"
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full text-center px-4 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors shadow-xs"
            >
              Find a Therapist
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
