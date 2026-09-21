import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';

export const metadata = {
  title: 'Marketing Link Details | MASSAF Admin',
  description: 'View marketing link details and associated bookings',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function MarketingLinkDetailPage({ params }: PageProps) {
  const { id } = await params;

  const link = await db.marketingLink.findUnique({
    where: { id },
    include: {
      bookings: {
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { name: true, email: true } },
          therapist: { select: { name: true } },
          service: { select: { name: true } },
        },
      },
    },
  });

  if (!link) {
    notFound();
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const fullUrl = baseUrl ? `${baseUrl}/?ref=${link.code}` : `/?ref=${link.code}`;
  const totalBookingValue = link.bookings.reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="space-y-6">
      {/* Breadcrumb / Back Navigation */}
      <div>
        <Link
          href="/admin/marketing-links"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors mb-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Marketing Links
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{link.name}</h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  link.isActive
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${link.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {link.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-500 mt-1">Code: {link.code}</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Clicks</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{link.clicks.toLocaleString()}</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Attributed Bookings</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{link.bookings.length.toLocaleString()}</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Booking Value</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">
            ${totalBookingValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Created Date</p>
          <p className="text-base font-semibold text-slate-900 mt-1">
            {new Date(link.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>
      </div>

      {/* Link Info Box */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
        <h2 className="text-sm font-bold text-slate-900">Generated Marketing Link</h2>
        <div className="flex items-center gap-3">
          <input
            type="text"
            readOnly
            value={fullUrl}
            className="w-full max-w-xl px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
          />
        </div>
      </div>

      {/* Associated Bookings Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Associated Bookings ({link.bookings.length})</h2>
          <p className="text-xs text-slate-500">Bookings attributed to this marketing link.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Booking Number</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Therapist</th>
                <th className="py-3 px-4">Service</th>
                <th className="py-3 px-4">Appointment Date</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {link.bookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <p className="font-medium">No bookings have been attributed to this link yet.</p>
                  </td>
                </tr>
              ) : (
                link.bookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-900">
                      <Link
                        href={`/admin/bookings/${booking.id}`}
                        className="hover:text-emerald-600 transition-colors"
                      >
                        {booking.bookingNumber}
                      </Link>
                    </td>

                    <td className="py-3.5 px-4 font-medium text-slate-900">
                      {booking.customer.name}
                    </td>

                    <td className="py-3.5 px-4 text-slate-700">
                      {booking.therapist?.name || <span className="text-slate-400 italic">Unassigned</span>}
                    </td>

                    <td className="py-3.5 px-4 text-slate-700">
                      {booking.service.name}
                    </td>

                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {new Date(booking.appointmentDateTime).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700">
                        {booking.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-semibold text-slate-900">
                      ${booking.amount.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
