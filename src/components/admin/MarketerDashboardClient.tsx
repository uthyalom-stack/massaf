'use client';

import React, { useState } from 'react';

export interface MarketerLinkSummary {
  id: string;
  name: string;
  code: string;
  destinationUrl: string;
  clicks: number;
  isActive: boolean;
  bookingsCount: number;
  paidRevenue: number;
}

export interface RecentAttributedBooking {
  id: string;
  bookingNumber: string;
  appointmentDateTime: string | Date;
  status: string;
  paymentStatus: string;
  amount: number;
  linkCode: string;
  linkName: string;
}

interface MarketerDashboardClientProps {
  marketerName: string;
  marketerEmail: string;
  stats: {
    totalClicks: number;
    totalBookings: number;
    paidBookings: number;
    paidRevenue: number;
  };
  links: MarketerLinkSummary[];
  recentBookings: RecentAttributedBooking[];
  baseUrl: string;
}

export function MarketerDashboardClient({
  marketerName,
  marketerEmail,
  stats,
  links,
  recentBookings,
  baseUrl,
}: MarketerDashboardClientProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyLink = (codeStr: string, id: string) => {
    const fullUrl = baseUrl ? `${baseUrl}/?ref=${codeStr}` : `/?ref=${codeStr}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'PENDING':
      case 'UNPAID':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'FAILED':
      case 'REFUNDED':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Marketer Performance Dashboard
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Performance overview for <strong className="text-slate-900">{marketerName}</strong> ({marketerEmail})
          </p>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Clicks */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Link Clicks</span>
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">{stats.totalClicks.toLocaleString()}</div>
          <p className="text-xs text-slate-500">
            Total referral link visits recorded
          </p>
        </div>

        {/* Total Attributed Bookings */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Bookings</span>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">{stats.totalBookings.toLocaleString()}</div>
          <p className="text-xs text-slate-500">
            Attributed appointment reservations
          </p>
        </div>

        {/* Paid Bookings */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Paid Bookings</span>
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900">{stats.paidBookings.toLocaleString()}</div>
          <p className="text-xs text-slate-500">
            Successfully paid sessions
          </p>
        </div>

        {/* Paid Revenue */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Paid Revenue</span>
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="text-3xl font-black text-emerald-700">
            ${stats.paidRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <p className="text-xs text-slate-500">
            Calculated from paid bookings
          </p>
        </div>
      </div>

      {/* Referral Links Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Your Referral Links</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Share these unique tracking links to generate attributed bookings.
            </p>
          </div>
          <span className="text-xs font-semibold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full border border-slate-200">
            {links.length} Link(s)
          </span>
        </div>

        {links.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No marketing referral links are currently assigned to your account.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Campaign / Code</th>
                  <th className="py-3 px-4">Referral Link</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Clicks</th>
                  <th className="py-3 px-4 text-right">Bookings</th>
                  <th className="py-3 px-4 text-right">Paid Revenue</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {links.map((link) => {
                  const displayUrl = baseUrl ? `${baseUrl}/?ref=${link.code}` : `/?ref=${link.code}`;
                  return (
                    <tr key={link.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        <div>{link.name}</div>
                        <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                          {link.code}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                        <span className="bg-slate-50 px-2 py-1 rounded border border-slate-200 block truncate max-w-xs">
                          {displayUrl}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            link.isActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${link.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {link.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium text-slate-900">
                        {link.clicks.toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium text-slate-900">
                        {link.bookingsCount.toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                        ${link.paidRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleCopyLink(link.code, link.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
                        >
                          {copiedId === link.id ? (
                            <span className="font-bold text-emerald-800">Copied!</span>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Attributed Bookings Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Recent Attributed Activity</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Recent appointments originating from your marketing referral links.
            </p>
          </div>
          <span className="text-xs text-slate-500">
            Showing latest {recentBookings.length} activity record(s)
          </span>
        </div>

        {recentBookings.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No attributed booking activity recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Booking Ref</th>
                  <th className="py-3 px-4">Appointment Date</th>
                  <th className="py-3 px-4">Referral Code</th>
                  <th className="py-3 px-4 text-center">Payment Status</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {recentBookings.map((bk) => (
                  <tr key={bk.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {bk.bookingNumber}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 text-xs">
                      {new Date(bk.appointmentDateTime).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                        {bk.linkCode}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getPaymentStatusBadge(bk.paymentStatus)}`}>
                        {bk.paymentStatus}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-bold text-slate-900">
                      ${bk.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
