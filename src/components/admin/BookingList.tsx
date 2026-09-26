'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookingStatus, PaymentStatus, ServiceLocationType } from '@prisma/client';

export interface AdminBookingListItem {
  id: string;
  bookingNumber: string;
  customerName: string;
  customerEmail: string;
  therapistId: string | null;
  therapistName: string;
  serviceName: string;
  appointmentDateTime: string;
  durationMinutes: number;
  locationType: ServiceLocationType;
  amount: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
}

interface BookingListProps {
  bookings: AdminBookingListItem[];
  initialSearch?: string;
  initialStatus?: string;
  initialDateFilter?: string;
}

export default function BookingList({
  bookings,
  initialSearch = '',
  initialStatus = 'ALL',
  initialDateFilter = 'ALL',
}: BookingListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [dateFilter, setDateFilter] = useState(initialDateFilter);

  const handleFilterChange = (newSearch: string, newStatus: string, newDate: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newSearch.trim()) {
      params.set('search', newSearch.trim());
    } else {
      params.delete('search');
    }

    if (newStatus && newStatus !== 'ALL') {
      params.set('status', newStatus);
    } else {
      params.delete('status');
    }

    if (newDate && newDate !== 'ALL') {
      params.set('dateFilter', newDate);
    } else {
      params.delete('dateFilter');
    }

    router.push(`/admin/bookings?${params.toString()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleFilterChange(search, status, dateFilter);
  };

  const getStatusBadge = (bStatus: BookingStatus) => {
    switch (bStatus) {
      case 'PENDING':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-200">Pending</span>;
      case 'CONFIRMED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 border border-blue-200">Confirmed</span>;
      case 'ASSIGNED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">Assigned</span>;
      case 'IN_PROGRESS':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 border border-purple-200">In Progress</span>;
      case 'COMPLETED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">Completed</span>;
      case 'CANCELLED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-100 text-rose-800 border border-rose-200">Cancelled</span>;
      case 'REFUNDED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-800 border border-slate-200">Refunded</span>;
      case 'NO_SHOW':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 border border-orange-200">No Show</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-800">{bStatus}</span>;
    }
  };

  const getPaymentBadge = (pStatus: PaymentStatus) => {
    switch (pStatus) {
      case 'PAID':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200/60">Paid</span>;
      case 'PENDING':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-50 text-amber-700 border border-amber-200/60">Payment Pending</span>;
      case 'UNPAID':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-100 text-slate-600 border border-slate-200/60">Unpaid</span>;
      case 'FAILED':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-rose-50 text-rose-700 border border-rose-200/60">Failed</span>;
      case 'REFUNDED':
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600 border border-gray-200/60">Refunded</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-100 text-slate-600">{pStatus}</span>;
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Search Input */}
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="search" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Search Bookings
            </label>
            <div className="relative">
              <input
                id="search"
                type="text"
                placeholder="Booking #, customer name/email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent text-slate-900 placeholder-slate-400"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    handleFilterChange('', status, dateFilter);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label htmlFor="status-filter" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Status Filter
            </label>
            <select
              id="status-filter"
              value={status}
              onChange={(e) => {
                const val = e.target.value;
                setStatus(val);
                handleFilterChange(search, val, dateFilter);
              }}
              className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent text-slate-900"
            >
              <option value="ALL">All Statuses</option>
              {Object.values(BookingStatus).map((st) => (
                <option key={st} value={st}>
                  {st.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <label htmlFor="date-filter" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Appointment Date
            </label>
            <select
              id="date-filter"
              value={dateFilter}
              onChange={(e) => {
                const val = e.target.value;
                setDateFilter(val);
                handleFilterChange(search, status, val);
              }}
              className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent text-slate-900"
            >
              <option value="ALL">All Dates</option>
              <option value="TODAY">Today</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="PAST">Past</option>
            </select>
          </div>

          {/* Search & Export Buttons */}
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="flex-1 px-3 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              Filter
            </button>
            <a
              href={`/api/admin/export?type=bookings&status=${status}&search=${encodeURIComponent(search)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors shrink-0"
            >
              📥 CSV
            </a>
          </div>
        </form>
      </div>

      {/* Bookings Display */}
      {bookings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-900">No bookings found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {initialSearch || initialStatus !== 'ALL' || initialDateFilter !== 'ALL'
              ? 'No bookings matched your search or filter criteria. Try adjusting your filters.'
              : 'There are currently no bookings in the database.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View (sm and above) */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 text-xs font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Booking Ref</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Therapist</th>
                  <th className="py-3.5 px-4">Service</th>
                  <th className="py-3.5 px-4">Date & Time</th>
                  <th className="py-3.5 px-4">Amount</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs text-slate-700">
                {bookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-4 font-mono font-bold text-slate-900">
                      {booking.bookingNumber}
                    </td>
                    <td className="py-4 px-4 font-medium text-slate-900">
                      <div>{booking.customerName}</div>
                      <div className="text-[11px] text-slate-500 font-normal">{booking.customerEmail}</div>
                    </td>
                    <td className="py-4 px-4">
                      {booking.therapistId ? (
                        <span className="font-semibold text-slate-800">{booking.therapistName}</span>
                      ) : (
                        <span className="text-amber-700 font-bold italic bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 font-medium text-slate-800">
                      {booking.serviceName}
                      <span className="block text-[11px] text-slate-500 font-normal">
                        {booking.durationMinutes} min • {booking.locationType === 'IN_HOME' ? 'In-Home' : 'Studio'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-medium text-slate-900">{formatDate(booking.appointmentDateTime)}</div>
                      <div className="text-[11px] text-slate-500">{formatTime(booking.appointmentDateTime)}</div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="font-bold text-slate-900">${booking.amount.toFixed(2)}</div>
                      <div className="mt-0.5">{getPaymentBadge(booking.paymentStatus)}</div>
                    </td>
                    <td className="py-4 px-4">
                      {getStatusBadge(booking.status)}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <Link
                        href={`/admin/bookings/${booking.id}`}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-100 text-slate-800 font-bold hover:bg-slate-200 transition-colors"
                      >
                        Details &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (below md) */}
          <div className="md:hidden space-y-4">
            {bookings.map((booking) => (
              <div key={booking.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Booking Reference</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">{booking.bookingNumber}</span>
                  </div>
                  <div>
                    {getStatusBadge(booking.status)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Customer</span>
                    <span className="font-semibold text-slate-900 block truncate">{booking.customerName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Therapist</span>
                    {booking.therapistId ? (
                      <span className="font-semibold text-slate-900 block truncate">{booking.therapistName}</span>
                    ) : (
                      <span className="text-amber-700 font-bold italic bg-amber-50 px-1.5 py-0.5 rounded text-[11px]">Unassigned</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Service & Location</span>
                    <span className="font-medium text-slate-800 block truncate">{booking.serviceName}</span>
                    <span className="text-[11px] text-slate-500">{booking.locationType === 'IN_HOME' ? 'In-Home' : 'Studio'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Appointment</span>
                    <span className="font-medium text-slate-900 block">{formatDate(booking.appointmentDateTime)}</span>
                    <span className="text-[11px] text-slate-500">{formatTime(booking.appointmentDateTime)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-slate-900 text-sm">${booking.amount.toFixed(2)}</span>
                    {getPaymentBadge(booking.paymentStatus)}
                  </div>

                  <Link
                    href={`/admin/bookings/${booking.id}`}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors"
                  >
                    Manage &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
