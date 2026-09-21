import React from 'react';
import { db } from '@/lib/db';
import { MarketingLinkList, MarketingLinkItem } from '@/components/admin/MarketingLinkList';

export const metadata = {
  title: 'Marketing Links | MASSAF Admin',
  description: 'Manage marketing links and simple attribution tracking',
};

export const dynamic = 'force-dynamic';

export default async function AdminMarketingLinksPage() {
  const marketingLinks = await db.marketingLink.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      bookings: {
        select: {
          id: true,
          amount: true,
        },
      },
    },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  const links: MarketingLinkItem[] = marketingLinks.map((link) => {
    const totalBookingValue = link.bookings.reduce((sum, b) => sum + b.amount, 0);
    return {
      id: link.id,
      name: link.name,
      code: link.code,
      destinationUrl: link.destinationUrl,
      clicks: link.clicks,
      isActive: link.isActive,
      createdAt: link.createdAt,
      bookingsCount: link.bookings.length,
      totalBookingValue,
    };
  });

  return <MarketingLinkList initialLinks={links} baseUrl={baseUrl} />;
}
