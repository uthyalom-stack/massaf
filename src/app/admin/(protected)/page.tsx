import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';

export const metadata = {
  title: 'Operations Center | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const session = await getVerifiedAdminSession();
  if (session?.role === 'STAFF') {
    redirect('/admin/marketer');
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  try {
    const [
      bookingsTodayCount,
      upcomingBookingsCount,
      pendingBookingsCount,
      unassignedBookingsCount,
      completedBookingsCount,
      cancelledBookingsCount,
      paidBookingsCount,
      pendingPaymentsCount,
      pendingGiftCardReviewsCount,
      pendingReviewsCount,
      approvedReviewsCount,
      activeTherapistsCount,
      pendingTherapistsCount,
      recentBookings,
      pendingGiftCards,
      recentAuditLogs,
    ] = await Promise.all([
      db.booking.count({
        where: {
          appointmentDateTime: { gte: todayStart, lte: todayEnd },
        },
      }),
      db.booking.count({
        where: {
          appointmentDateTime: { gte: todayEnd },
          status: { in: ['CONFIRMED', 'ASSIGNED', 'PENDING'] },
        },
      }),
      db.booking.count({ where: { status: 'PENDING' } }),
      db.booking.count({ where: { therapistId: null, status: { in: ['PENDING', 'CONFIRMED'] } } }),
      db.booking.count({ where: { status: 'COMPLETED' } }),
      db.booking.count({ where: { status: 'CANCELLED' } }),
      db.booking.count({ where: { paymentStatus: 'PAID' } }),
      db.booking.count({ where: { paymentStatus: 'PENDING' } }),
      db.giftCardSubmission.count({ where: { status: 'PENDING' } }),
      db.review.count({ where: { status: 'PENDING' } }),
      db.review.count({ where: { status: 'APPROVED' } }),
      db.therapist.count({ where: { isActive: true } }),
      db.therapist.count({ where: { verificationStatus: 'PENDING' } }),
      db.booking.findMany({
        take: 5,
        orderBy: { appointmentDateTime: 'asc' },
        where: { appointmentDateTime: { gte: todayStart } },
        include: {
          customer: { select: { name: true } },
          service: { select: { name: true } },
          therapist: { select: { name: true } },
        },
      }),
      db.giftCardSubmission.findMany({
        take: 5,
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        include: {
          booking: {
            include: {
              customer: { select: { name: true } },
              service: { select: { name: true } },
            },
          },
        },
      }),
      db.adminAuditLog.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return (
      <div className="space-y-8">
        {/* Operations Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Operations Center
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Real-time platform metrics, booking queues, payment verification, and system status.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/payments"
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors"
            >
              Gift Card Queue ({pendingGiftCardReviewsCount})
            </Link>
            <Link
              href="/admin/bookings?quickFilter=unassigned"
              className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors"
            >
              Unassigned ({unassignedBookingsCount})
            </Link>
          </div>
        </div>

        {/* Operational Metrics Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Link href="/admin/bookings" className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-300 transition-all block">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Bookings Today</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{bookingsTodayCount}</div>
            <div className="text-[10px] font-semibold text-emerald-700 mt-1">View Schedule &rarr;</div>
          </Link>

          <Link href="/admin/bookings?quickFilter=unassigned" className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-300 transition-all block">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Needs Assignment</div>
            <div className="text-2xl font-black text-amber-600 mt-1">{unassignedBookingsCount}</div>
            <div className="text-[10px] font-semibold text-amber-700 mt-1">Assign Therapist &rarr;</div>
          </Link>

          <Link href="/admin/payments" className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-300 transition-all block">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Pending Gift Cards</div>
            <div className="text-2xl font-black text-amber-600 mt-1">{pendingGiftCardReviewsCount}</div>
            <div className="text-[10px] font-semibold text-amber-700 mt-1">Review Payments &rarr;</div>
          </Link>

          <Link href="/admin/reviews" className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-300 transition-all block">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Pending Reviews</div>
            <div className="text-2xl font-black text-purple-600 mt-1">{pendingReviewsCount}</div>
            <div className="text-[10px] font-semibold text-purple-700 mt-1">Moderate &rarr;</div>
          </Link>

          <Link href="/admin/therapists" className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-300 transition-all block">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Active Therapists</div>
            <div className="text-2xl font-black text-blue-600 mt-1">{activeTherapistsCount}</div>
            <div className="text-[10px] font-semibold text-blue-700 mt-1">{pendingTherapistsCount} pending verification &rarr;</div>
          </Link>

          <Link href="/admin/bookings" className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all block">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Upcoming Bookings</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{upcomingBookingsCount}</div>
            <div className="text-[10px] font-semibold text-slate-600 mt-1">{completedBookingsCount} completed &rarr;</div>
          </Link>
        </div>

        {/* Dashboard Sections Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1 & 2: Upcoming Appointments Schedule */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Upcoming & Today's Appointments</h2>
              <Link href="/admin/bookings" className="text-xs font-bold text-emerald-700 hover:underline">
                View All Bookings &rarr;
              </Link>
            </div>

            <div className="space-y-3">
              {recentBookings.length === 0 ? (
                <p className="text-xs text-slate-400 italic p-4 text-center">No upcoming appointments scheduled for today.</p>
              ) : (
                recentBookings.map((b) => (
                  <div key={b.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4">
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/bookings/${b.id}`} className="font-mono font-bold text-emerald-700 hover:underline">
                          #{b.bookingNumber}
                        </Link>
                        <span className="font-bold text-slate-900">{b.customer.name}</span>
                      </div>
                      <div className="text-slate-500">
                        {b.service.name} • {b.therapist?.name ? `Therapist: ${b.therapist.name}` : <strong className="text-amber-600">Unassigned</strong>}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold text-slate-900 block">
                        {new Date(b.appointmentDateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[10px] font-semibold uppercase text-slate-400">
                        {new Date(b.appointmentDateTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 3: Pending Gift Cards & Quick Review */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Gift Card Queue</h2>
              <Link href="/admin/payments" className="text-xs font-bold text-amber-700 hover:underline">
                Queue ({pendingGiftCardReviewsCount}) &rarr;
              </Link>
            </div>

            <div className="space-y-3">
              {pendingGiftCards.length === 0 ? (
                <p className="text-xs text-slate-400 italic p-4 text-center">No pending gift card payments awaiting review.</p>
              ) : (
                pendingGiftCards.map((g) => (
                  <div key={g.id} className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200/60 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-amber-900">#{g.booking.bookingNumber}</span>
                      <span className="font-bold text-slate-900">${g.declaredValue} ({g.cardType})</span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Customer: <strong>{g.booking.customer.name}</strong>
                    </div>
                    <Link
                      href="/admin/payments"
                      className="inline-block text-[11px] font-bold text-amber-700 hover:underline pt-1"
                    >
                      Review Payment Proof &rarr;
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Recent Audit Log Section */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">Recent Admin Audit Log</h2>
            <Link href="/admin/audit-log" className="text-xs font-bold text-emerald-700 hover:underline">
              View Full Audit Log &rarr;
            </Link>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {recentAuditLogs.length === 0 ? (
              <p className="text-xs text-slate-400 italic p-4 text-center">No administrative actions logged yet.</p>
            ) : (
              recentAuditLogs.map((log) => (
                <div key={log.id} className="py-2.5 flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-slate-900">{log.description}</div>
                    <div className="text-[10px] text-slate-400">
                      By <strong className="text-slate-700">{log.actorEmail}</strong> ({log.actorRole})
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    console.error('Error rendering Admin Dashboard Page:', err);
    return (
      <div className="p-8 text-center text-slate-600 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Unable to load dashboard</h2>
        <p className="text-xs">Please refresh or check database connection status in Settings.</p>
      </div>
    );
  }
}
