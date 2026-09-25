import React from 'react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { AnalyticsClient } from '@/components/admin/AnalyticsClient';

export const metadata = {
  title: 'Analytics & Insights | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  const session = await getVerifiedAdminSession();
  if (!session) redirect('/admin/login');
  if (session.role === 'STAFF') redirect('/admin/marketer');

  const [
    allBookings,
    allCustomers,
    allTherapists,
    allServices,
    allMarketingLinks,
    processedRefunds,
  ] = await Promise.all([
    db.booking.findMany({
      include: {
        service: { select: { id: true, name: true } },
        therapist: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        marketingLink: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.customer.findMany({
      include: {
        _count: { select: { bookings: true } },
      },
    }),
    db.therapist.findMany({
      include: {
        _count: { select: { bookings: true } },
      },
      orderBy: { name: 'asc' },
    }),
    db.service.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { bookings: true } },
      },
      orderBy: { name: 'asc' },
    }),
    db.marketingLink.findMany({
      include: {
        bookings: { select: { id: true, amount: true, paymentStatus: true } },
      },
      orderBy: { clicks: 'desc' },
    }),
    db.refundRecord.findMany({
      where: { status: 'PROCESSED' },
    }),
  ]);

  // Compute Bookings Metrics
  const bookingMetrics = {
    total: allBookings.length,
    completed: allBookings.filter((b) => b.status === 'COMPLETED').length,
    cancelled: allBookings.filter((b) => b.status === 'CANCELLED').length,
    pending: allBookings.filter((b) => b.status === 'PENDING').length,
    noShow: allBookings.filter((b) => b.status === 'NO_SHOW').length,
  };

  // Revenue Metrics
  const grossValue = allBookings.reduce((sum, b) => sum + b.amount, 0);
  const paidRevenue = allBookings
    .filter((b) => b.paymentStatus === 'PAID')
    .reduce((sum, b) => sum + b.amount, 0);
  const pendingRevenue = allBookings
    .filter((b) => b.paymentStatus === 'PENDING' || b.paymentStatus === 'UNPAID')
    .reduce((sum, b) => sum + b.amount, 0);
  const refundedRevenue = processedRefunds.reduce((sum, r) => sum + r.amount, 0);

  const revenueMetrics = {
    grossValue,
    paidRevenue,
    pendingRevenue,
    refundedRevenue,
  };

  // Customer Metrics
  const totalCustomers = allCustomers.length;
  const repeatCustomers = allCustomers.filter((c) => c._count.bookings > 1).length;
  const newCustomers = totalCustomers - repeatCustomers;

  const customerMetrics = {
    total: totalCustomers,
    newCustomers,
    repeatCustomers,
  };

  // Therapist Metrics
  const activeTherapists = allTherapists.filter((t) => t.isActive).length;
  const verifiedTherapists = allTherapists.filter((t) => t.verificationStatus === 'VERIFIED').length;
  const pendingVerificationTherapists = allTherapists.filter((t) => t.verificationStatus === 'PENDING').length;

  const therapistStats = allTherapists.map((t) => ({
    id: t.id,
    name: t.name,
    isActive: t.isActive,
    verificationStatus: t.verificationStatus,
    bookingCount: t._count.bookings,
  }));

  // Service Breakdown
  const serviceStatsMap = new Map<string, { id: string; name: string; bookings: number; revenue: number }>();
  for (const s of allServices) {
    serviceStatsMap.set(s.id, { id: s.id, name: s.name, bookings: 0, revenue: 0 });
  }

  for (const b of allBookings) {
    if (serviceStatsMap.has(b.serviceId)) {
      const entry = serviceStatsMap.get(b.serviceId)!;
      entry.bookings++;
      if (b.paymentStatus === 'PAID') {
        entry.revenue += b.amount;
      }
    }
  }

  const serviceStats = Array.from(serviceStatsMap.values()).sort((a, b) => b.bookings - a.bookings);

  // Marketing Performance Metrics
  const totalMarketingClicks = allMarketingLinks.reduce((sum, l) => sum + l.clicks, 0);
  let totalAttributedBookings = 0;
  let paidMarketingRevenue = 0;

  const marketingLinkStats = allMarketingLinks.map((l) => {
    totalAttributedBookings += l.bookings.length;
    const linkPaid = l.bookings
      .filter((b) => b.paymentStatus === 'PAID')
      .reduce((sum, b) => sum + b.amount, 0);
    paidMarketingRevenue += linkPaid;

    return {
      id: l.id,
      code: l.code,
      name: l.name,
      clicks: l.clicks,
      bookingsCount: l.bookings.length,
      paidRevenue: linkPaid,
    };
  });

  const marketingMetrics = {
    totalClicks: totalMarketingClicks,
    totalBookings: totalAttributedBookings,
    paidRevenue: paidMarketingRevenue,
    links: marketingLinkStats,
  };

  // Group Bookings over time (by Month YYYY-MM)
  const monthlyMap = new Map<string, number>();
  for (const b of allBookings) {
    const ymd = new Date(b.createdAt).toISOString().substring(0, 7); // YYYY-MM
    monthlyMap.set(ymd, (monthlyMap.get(ymd) || 0) + 1);
  }

  const bookingsOverTime = Array.from(monthlyMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Operational Analytics
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Real-time platform insights derived directly from actual bookings, payments, and therapist activity.
          </p>
        </div>

        <a
          href="/api/admin/export?type=bookings"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-colors shadow-xs shrink-0 inline-flex items-center gap-2"
        >
          <span>📥</span>
          <span>Export Bookings CSV</span>
        </a>
      </div>

      <AnalyticsClient
        bookingMetrics={bookingMetrics}
        revenueMetrics={revenueMetrics}
        customerMetrics={customerMetrics}
        therapistMetrics={{
          activeCount: activeTherapists,
          verifiedCount: verifiedTherapists,
          pendingCount: pendingVerificationTherapists,
          stats: therapistStats,
        }}
        serviceStats={serviceStats}
        marketingMetrics={marketingMetrics}
        bookingsOverTime={bookingsOverTime}
      />
    </div>
  );
}
