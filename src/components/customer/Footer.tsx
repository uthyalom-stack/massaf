import React from 'react';
import Link from 'next/link';
import { NavItem } from '@/types/customer';

interface FooterProps {
  navLinks: NavItem[];
  branding?: {
    logoUrl: string | null;
    siteName: string;
    tagline: string;
  };
}

export function Footer({ navLinks, branding }: FooterProps) {
  const siteName = branding?.siteName || 'MASSAF';
  const logoUrl = branding?.logoUrl || null;

  return (
    <footer className="bg-slate-900 text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand & Description */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2">
              {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoUrl}
                  alt={`${siteName} Logo`}
                  className="w-9 h-9 object-contain rounded-lg shadow-2xs"
                />
              ) : (
                <span className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                  {siteName.charAt(0) || 'M'}
                </span>
              )}
              <span className="text-xl font-extrabold tracking-tight text-white">
                {siteName}
              </span>
            </Link>
            <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
              {siteName} connects clients with premier, fully certified and vetted independent massage therapists across North America for in-home and studio sessions.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-slate-800 text-emerald-400 border border-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              U.S. Licensed Therapists
            </div>
          </div>

          {/* Quick Navigation Links */}
          <div>
            <h3 className="text-xs font-semibold text-slate-100 uppercase tracking-wider mb-4">
              Explore
            </h3>
            <ul className="space-y-2.5 text-sm">
              {navLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="hover:text-emerald-400 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support & Contact Placeholder */}
          <div>
            <h3 className="text-xs font-semibold text-slate-100 uppercase tracking-wider mb-4">
              Support
            </h3>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li>
                <a href="#about" className="hover:text-emerald-400 transition-colors">
                  Help & Support
                </a>
              </li>
              <li>
                <a href="#about" className="hover:text-emerald-400 transition-colors">
                  Therapist Verification
                </a>
              </li>
              <li>
                <a href="#about" className="hover:text-emerald-400 transition-colors">
                  Safety Guidelines
                </a>
              </li>
              <li>
                <span className="text-slate-500">Contact: support@massaf.com</span>
              </li>
            </ul>
          </div>

          {/* Legal / Policy Links */}
          <div>
            <h3 className="text-xs font-semibold text-slate-100 uppercase tracking-wider mb-4">
              Legal
            </h3>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li>
                <a href="#about" className="hover:text-emerald-400 transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#about" className="hover:text-emerald-400 transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#about" className="hover:text-emerald-400 transition-colors">
                  Cancellation Policy
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} MASSAF Technologies Inc. All rights reserved.</p>
          <div className="flex items-center space-x-6">
            <a href="#about" className="hover:text-slate-400 transition-colors">
              Privacy
            </a>
            <a href="#about" className="hover:text-slate-400 transition-colors">
              Terms
            </a>
            <a href="#about" className="hover:text-slate-400 transition-colors">
              Accessibility
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
