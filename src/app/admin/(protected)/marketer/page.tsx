import React from 'react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { MarketerDashboardClient, MarketerLinkSummary, RecentAttributedBooking } from '@/components/admin/MarketerDashboardClient';
import { getMarketerLeaderboardAction } from '@/app/admin/actions';

export const metadata = {
  title: 'Marketer Dashboard | MASSAF Admin',
  description: 'Performance statistics and referral link management',
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ userId?: string }>;
}

export default async function MarketerDashboardPage({ searchParams }: PageProps) {
  const session = await getVerifiedAdminSession();
  if (!session) {
    redirect('/admin/login');
  }

  const resolvedSearchParams = await searchParams;

  // STRICT SERVER-SIDE DATA ISOLATION:
  // STAFF role can ONLY view their own account metrics (session.entityId).
  // SUPER_ADMIN or ADMIN can optionally view another marketer via userId search parameter.
  let targetUserId = session.entityId;
  if (session.role !== 'STAFF' && resolvedSearchParams?.userId) {
    targetUserId = resolvedSearchParams.userId;
  }

  // Fetch marketer user details
  const marketerUser = await db.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  if (!marketerUser) {
    redirect('/admin');
  }

  // Fetch marketing links owned by marketer
  const userLinks = await db.marketingLink.findMany({
    where: { userId: targetUserId },
    include: {
      bookings: {
        select: {
          id: true,
          amount: true,
          paymentStatus: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const linkIds = userLinks.map((l) => l.id);

  // Fetch recent attributed bookings across marketer's links
  let recentBookingsRaw: Array<{
    id: string;
    bookingNumber: string;
    appointmentDateTime: Date;
    status: string;
    paymentStatus: string;
    amount: number;
    marketingLink: { code: string; name: string } | null;
  }> = [];

  if (linkIds.length > 0) {
    recentBookingsRaw = await db.booking.findMany({
      where: {
        marketingLinkId: { in: linkIds },
      },
      select: {
        id: true,
        bookingNumber: true,
        appointmentDateTime: true,
        status: true,
        paymentStatus: true,
        amount: true,
        marketingLink: {
          select: {
            code: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });
  }

  const linksSummary: MarketerLinkSummary[] = userLinks.map((link) => {
    const linkPaidBookings = link.bookings.filter((b) => b.paymentStatus === 'PAID');
    const linkPaidRevenue = linkPaidBookings.reduce((sum, b) => sum + b.amount, 0);

    return {
      id: link.id,
      name: link.name,
      code: link.code,
      destinationUrl: link.destinationUrl,
      clicks: link.clicks,
      isActive: link.isActive,
      bookingsCount: link.bookings.length,
      paidRevenue: Math.round(linkPaidRevenue * 100) / 100,
    };
  });

  // Calculate real performance metrics
  const totalClicks = userLinks.reduce((sum, l) => sum + l.clicks, 0);
  const totalBookings = userLinks.reduce((sum, l) => sum + l.bookings.length, 0);
  const paidBookings = userLinks.reduce(
    (sum, l) => sum + l.bookings.filter((b) => b.paymentStatus === 'PAID').length,
    0
  );
  const paidRevenue = userLinks.reduce(
    (sum, l) =>
      sum +
      l.bookings
        .filter((b) => b.paymentStatus === 'PAID')
        .reduce((bSum, b) => bSum + b.amount, 0),
    0
  );

  const recentBookings: RecentAttributedBooking[] = recentBookingsRaw.map((bk) => ({
    id: bk.id,
    bookingNumber: bk.bookingNumber,
    appointmentDateTime: bk.appointmentDateTime,
    status: bk.status,
    paymentStatus: bk.paymentStatus,
    amount: bk.amount,
    linkCode: bk.marketingLink?.code || 'N/A',
    linkName: bk.marketingLink?.name || 'N/A',
  }));

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  // Fetch leaderboard entries for embedding directly in Marketer Dashboard
  const leaderboardRes = await getMarketerLeaderboardAction();
  const leaderboardEntries = leaderboardRes.success && leaderboardRes.leaderboard
    ? leaderboardRes.leaderboard.map((entry, idx) => ({
        rank: idx + 1,
        userId: entry.userId,
        name: entry.name,
        email: entry.email,
        clicks: entry.clicks,
        totalBookings: entry.totalBookings,
        paidRevenue: entry.paidRevenue,
      }))
    : [];

  return (
    <MarketerDashboardClient
      marketerName={marketerUser.name || marketerUser.email}
      marketerEmail={marketerUser.email}
      currentUserId={session.entityId}
      stats={{
        totalClicks,
        totalBookings,
        paidBookings,
        paidRevenue: Math.round(paidRevenue * 100) / 100,
      }}
      links={linksSummary}
      recentBookings={recentBookings}
      leaderboard={leaderboardEntries}
      baseUrl={baseUrl}
    />
  );
}
