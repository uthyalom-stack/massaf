import React, { Suspense } from 'react';
import { Header } from '@/components/customer/Header';
import { Footer } from '@/components/customer/Footer';
import { NAV_LINKS } from '@/lib/mock-data';
import { MarketingTracker } from '@/components/customer/MarketingTracker';
import { getBrandingSettings } from '@/lib/branding';

export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const branding = await getBrandingSettings();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      <Suspense fallback={null}>
        <MarketingTracker />
      </Suspense>
      <Header navLinks={NAV_LINKS} branding={branding} />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <Footer navLinks={NAV_LINKS} branding={branding} />
    </div>
  );
}
