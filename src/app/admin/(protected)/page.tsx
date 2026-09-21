import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getVerifiedAdminSession } from '@/lib/auth-session';

export const metadata = {
  title: 'Dashboard | MASSAF Admin',
};

// Force dynamic rendering so summary counts reflect real-time database state
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const session = await getVerifiedAdminSession();
  if (session?.role === 'STAFF') {
    redirect('/admin/marketer');
  }

  let totalTherapists = 0;
  let activeTherapists = 0;
  let inactiveTherapists = 0;
  let totalBookings = 0;
  let pendingBookings = 0;
  let completedBookings = 0;
  let pendingReviews = 0;

  try {
    const [
      therapistTotalCount,
      therapistActiveCount,
      therapistInactiveCount,
      bookingTotalCount,
      bookingPendingCount,
      bookingCompletedCount,
      reviewPendingCount,
    ] = await Promise.all([
      db.therapist.count(),
      db.therapist.count({ where: { isActive: true } }),
      db.therapist.count({ where: { isActive: false } }),
      db.booking.count(),
      db.booking.count({ where: { status: 'PENDING' } }),
      db.booking.count({ where: { status: 'COMPLETED' } }),
      db.review.count({ where: { status: 'PENDING' } }),
    ]);

    totalTherapists = therapistTotalCount;
    activeTherapists = therapistActiveCount;
    inactiveTherapists = therapistInactiveCount;
    totalBookings = bookingTotalCount;
    pendingBookings = bookingPendingCount;
    completedBookings = bookingCompletedCount;
    pendingReviews = reviewPendingCount;
  } catch (error) {
    console.error('Error loading admin dashboard summary counts:', error);
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Admin Dashboard
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            System overview and summary statistics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/admin/therapists/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors shadow-xs"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add New Therapist
          </Link>
        </div>
      </div>

      {/* Summary Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Therapists */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Therapists</span>
            <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">{totalTherapists}</div>
          <div className="flex items-center gap-3 text-xs pt-1">
            <span className="text-emerald-700 font-semibold">{activeTherapists} active</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-500">{inactiveTherapists} inactive</span>
          </div>
        </div>

        {/* Total Bookings */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Bookings</span>
            <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">{totalBookings}</div>
          <div className="flex items-center gap-3 text-xs pt-1">
            <span className="text-amber-700 font-semibold">{pendingBookings} pending</span>
            <span className="text-slate-300">•</span>
            <span className="text-emerald-700 font-semibold">{completedBookings} completed</span>
          </div>
        </div>

        {/* Pending Reviews */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Pending Reviews</span>
            <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">{pendingReviews}</div>
          <p className="text-xs text-slate-500 pt-1">
            Customer reviews awaiting moderation
          </p>
        </div>

        {/* Quick Management Link */}
        <div className="bg-emerald-900 text-white rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Quick Link</span>
            <h3 className="text-lg font-bold mt-1">Therapist Roster</h3>
            <p className="text-xs text-emerald-200 mt-1">
              Manage therapist profiles, service areas, and availability.
            </p>
          </div>
          <div className="pt-3">
            <Link
              href="/admin/therapists"
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-white text-emerald-900 px-3 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              Manage Therapists &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Database State Banner / Guide */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Platform Management System</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          Welcome to the MASSAF Admin Portal. All therapist records created or modified here are saved directly in the database.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <h3 className="text-xs font-bold text-slate-900 uppercase">Therapist Profiles</h3>
            <p className="text-xs text-slate-600">
              Create and maintain therapist biographies, status, studio/in-home offerings.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <h3 className="text-xs font-bold text-slate-900 uppercase">Services & Areas</h3>
            <p className="text-xs text-slate-600">
              Assign specific services, custom prices, and coverage ZIP codes per therapist.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <h3 className="text-xs font-bold text-slate-900 uppercase">Schedules & Photos</h3>
            <p className="text-xs text-slate-600">
              Configure weekly working hours and add photo gallery links.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
