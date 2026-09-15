import React from 'react';
import { Header } from '@/components/customer/Header';
import { Footer } from '@/components/customer/Footer';
import { NAV_LINKS } from '@/lib/mock-data';

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      <Header navLinks={NAV_LINKS} />
      <main className="flex-1">{children}</main>
      <Footer navLinks={NAV_LINKS} />
    </div>
  );
}
