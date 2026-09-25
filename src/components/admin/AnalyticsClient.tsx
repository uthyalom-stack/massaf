'use client';

import React from 'react';
import Link from 'next/link';

interface BookingMetrics {
  total: number;
  completed: number;
  cancelled: number;
  pending: number;
  noShow: number;
}

interface RevenueMetrics {
  grossValue: number;
  paidRevenue: number;
  pendingRevenue: number;
  refundedRevenue: number;
}

interface CustomerMetrics {
  total: number;
  newCustomers: number;
  repeatCustomers: number;
}

interface TherapistStatItem {
  id: string;
  name: string;
  isActive: boolean;
  verificationStatus: string;
  bookingCount: number;
}

interface ServiceStatItem {
  id: string;
  name: string;
  bookings: number;
  revenue: number;
}

interface MarketingLinkStatItem {
  id: string;
  code: string;
  name: string;
  clicks: number;
  bookingsCount: number;
  paidRevenue: number;
}

interface AnalyticsClientProps {
  bookingMetrics: BookingMetrics;
  revenueMetrics: RevenueMetrics;
  customerMetrics: CustomerMetrics;
  therapistMetrics: {
    activeCount: number;
    verifiedCount: number;
    pendingCount: number;
    stats: TherapistStatItem[];
  };
  serviceStats: ServiceStatItem[];
  marketingMetrics: {
    totalClicks: number;
    totalBookings: number;
    paidRevenue: number;
    links: MarketingLinkStatItem[];
  };
  bookingsOverTime: Array<{ month: string; count: number }>;
}

export function AnalyticsClient({
  bookingMetrics,
  revenueMetrics,
  customerMetrics,
  therapistMetrics,
  serviceStats,
  marketingMetrics,
  bookingsOverTime,
}: AnalyticsClientProps) {
  return (
    <div className="space-y-8">
      {/* 1. Revenue & Bookings Top Cards */}
      <div>
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Revenue & Bookings Snapshot</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <span className="text-slate-500 text-xs font-semibold block">Paid Revenue</span>
            <span className="text-2xl font-black text-emerald-700 block">${revenueMetrics.paidRevenue.toFixed(2)}</span>
            <span className="text-[10px] text-slate-400 block font-mono">Gross: ${revenueMetrics.grossValue.toFixed(2)}</span>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <span className="text-slate-500 text-xs font-semibold block">Total Bookings</span>
            <span className="text-2xl font-black text-slate-900 block">{bookingMetrics.total}</span>
            <span className="text-[10px] text-emerald-600 block font-semibold">{bookingMetrics.completed} completed</span>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <span className="text-slate-500 text-xs font-semibold block">Pending / Unpaid</span>
            <span className="text-2xl font-black text-amber-700 block">${revenueMetrics.pendingRevenue.toFixed(2)}</span>
            <span className="text-[10px] text-amber-600 block font-semibold">{bookingMetrics.pending} pending bookings</span>
          </div>

          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <span className="text-slate-500 text-xs font-semibold block">Refunded Revenue</span>
            <span className="text-2xl font-black text-purple-700 block">${revenueMetrics.refundedRevenue.toFixed(2)}</span>
            <span className="text-[10px] text-rose-600 block font-semibold">{bookingMetrics.cancelled} cancelled</span>
          </div>
        </div>
      </div>

      {/* 2. Customer & Therapist Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 text-xs">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
            Customer Directory Analytics
          </h2>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-500 block text-[10px] font-bold uppercase">Total Accounts</span>
              <span className="text-xl font-black text-slate-900 block mt-1">{customerMetrics.total}</span>
            </div>

            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
              <span className="text-blue-800 block text-[10px] font-bold uppercase">New Clients</span>
              <span className="text-xl font-black text-blue-900 block mt-1">{customerMetrics.newCustomers}</span>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-emerald-800 block text-[10px] font-bold uppercase">Repeat Clients</span>
              <span className="text-xl font-black text-emerald-900 block mt-1">{customerMetrics.repeatCustomers}</span>
            </div>
          </div>
        </div>

        {/* Therapist Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 text-xs">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
            Therapist Verification & Active Status
          </h2>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-emerald-800 block text-[10px] font-bold uppercase">Active Roster</span>
              <span className="text-xl font-black text-emerald-900 block mt-1">{therapistMetrics.activeCount}</span>
            </div>

            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
              <span className="text-blue-800 block text-[10px] font-bold uppercase">Verified</span>
              <span className="text-xl font-black text-blue-900 block mt-1">{therapistMetrics.verifiedCount}</span>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
              <span className="text-amber-800 block text-[10px] font-bold uppercase">Pending Queue</span>
              <span className="text-xl font-black text-amber-900 block mt-1">{therapistMetrics.pendingCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Services Breakdown & Marketing Links Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Services Revenue */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Service Popularity & Revenue
            </h2>
            <Link href="/admin/services" className="text-xs font-bold text-emerald-700 hover:underline">
              Manage Services →
            </Link>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px]">
                  <th className="py-2.5 px-3">Service Name</th>
                  <th className="py-2.5 px-3">Bookings</th>
                  <th className="py-2.5 px-3 text-right">Paid Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {serviceStats.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{s.name}</td>
                    <td className="py-2.5 px-3 text-slate-700">{s.bookings}</td>
                    <td className="py-2.5 px-3 text-right font-black text-emerald-700">${s.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Marketing Links Performance */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Marketing Attribution Summary
            </h2>
            <Link href="/admin/marketers" className="text-xs font-bold text-emerald-700 hover:underline">
              Manage Marketers →
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-500 text-[10px] font-bold uppercase block">Total Clicks</span>
              <span className="font-black text-slate-900 text-base">{marketingMetrics.totalClicks}</span>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-500 text-[10px] font-bold uppercase block">Attributed</span>
              <span className="font-black text-slate-900 text-base">{marketingMetrics.totalBookings}</span>
            </div>
            <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-emerald-800 text-[10px] font-bold uppercase block">Attributed Paid</span>
              <span className="font-black text-emerald-900 text-base">${marketingMetrics.paidRevenue.toFixed(2)}</span>
            </div>
          </div>

          <div className="overflow-x-auto text-xs max-h-56 overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px] sticky top-0 bg-white">
                  <th className="py-2 px-2">Code</th>
                  <th className="py-2 px-2">Clicks</th>
                  <th className="py-2 px-2">Bookings</th>
                  <th className="py-2 px-2 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {marketingMetrics.links.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400 italic">No marketing links active.</td>
                  </tr>
                ) : (
                  marketingMetrics.links.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2 font-mono font-bold text-emerald-700">{l.code}</td>
                      <td className="py-2 px-2 text-slate-700">{l.clicks}</td>
                      <td className="py-2 px-2 text-slate-700">{l.bookingsCount}</td>
                      <td className="py-2 px-2 text-right font-black text-slate-900">${l.paidRevenue.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 4. Bookings per Therapist */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
          Bookings per Therapist Roster
        </h2>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase font-bold text-[10px]">
                <th className="py-2.5 px-3">Therapist Name</th>
                <th className="py-2.5 px-3">Verification</th>
                <th className="py-2.5 px-3">Active State</th>
                <th className="py-2.5 px-3 text-right">Assigned Bookings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {therapistMetrics.stats.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-bold text-slate-900">
                    <Link href={`/admin/therapists/${t.id}`} className="hover:underline">
                      {t.name}
                    </Link>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                      {t.verificationStatus}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    {t.isActive ? (
                      <span className="text-emerald-700 font-bold">Active</span>
                    ) : (
                      <span className="text-slate-400 font-medium">Inactive</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-black text-slate-900">{t.bookingCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Bookings Trend Over Time */}
      {bookingsOverTime.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 text-xs">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
            Bookings Over Time
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {bookingsOverTime.map((item) => (
              <div key={item.month} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 block font-mono">{item.month}</span>
                <span className="text-lg font-black text-slate-900 block">{item.count}</span>
                <span className="text-[10px] text-slate-500 block">Bookings</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
