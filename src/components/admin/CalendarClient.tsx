'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

export interface CalendarBooking {
  id: string;
  bookingNumber: string;
  customerId: string;
  customerName: string;
  therapistId: string | null;
  therapistName: string | null;
  serviceId: string;
  serviceName: string;
  appointmentDateTime: string; // ISO String
  durationMinutes: number;
  locationType: 'STUDIO' | 'IN_HOME';
  status: string;
  paymentStatus: string;
  amount: number;
}

interface CalendarClientProps {
  bookings: CalendarBooking[];
  therapists: { id: string; name: string }[];
  services: { id: string; name: string }[];
}

type ViewMode = 'day' | 'week' | 'month';

function getStartOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sun
  const diff = date.getDate() - day;
  return new Date(date.setDate(diff));
}

function formatTime(isoStr: string): string {
  const date = new Date(isoStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CalendarClient({ bookings, therapists, services }: CalendarClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  // Filters
  const [selectedTherapistId, setSelectedTherapistId] = useState<string>('ALL');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedLocationType, setSelectedLocationType] = useState<string>('ALL');

  // Filtered Bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (selectedTherapistId !== 'ALL') {
        if (selectedTherapistId === 'UNASSIGNED' && b.therapistId !== null) return false;
        if (selectedTherapistId !== 'UNASSIGNED' && b.therapistId !== selectedTherapistId) return false;
      }
      if (selectedServiceId !== 'ALL' && b.serviceId !== selectedServiceId) return false;
      if (selectedStatus !== 'ALL' && b.status !== selectedStatus) return false;
      if (selectedLocationType !== 'ALL' && b.locationType !== selectedLocationType) return false;
      return true;
    });
  }, [bookings, selectedTherapistId, selectedServiceId, selectedStatus, selectedLocationType]);

  // Date Navigation Handlers
  const handleToday = () => setCurrentDate(new Date());

  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === 'day') {
      next.setDate(next.getDate() - 1);
    } else if (viewMode === 'week') {
      next.setDate(next.getDate() - 7);
    } else {
      next.setMonth(next.getMonth() - 1);
    }
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === 'day') {
      next.setDate(next.getDate() + 1);
    } else if (viewMode === 'week') {
      next.setDate(next.getDate() + 7);
    } else {
      next.setMonth(next.getMonth() + 1);
    }
    setCurrentDate(next);
  };

  // Unassigned Count
  const unassignedCount = useMemo(() => {
    return bookings.filter((b) => b.therapistId === null && b.status !== 'CANCELLED').length;
  }, [bookings]);

  // Calendar Days computation
  const daysHeader = useMemo(() => {
    if (viewMode === 'day') {
      return [currentDate];
    }
    if (viewMode === 'week') {
      const start = getStartOfWeek(currentDate);
      const days: Date[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        days.push(d);
      }
      return days;
    }
    // Month mode
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startWeek = getStartOfWeek(startOfMonth);
    const days: Date[] = [];
    let cur = new Date(startWeek);
    while (cur <= endOfMonth || days.length % 7 !== 0) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [viewMode, currentDate]);

  // Map bookings to YYYY-MM-DD
  const bookingsByYmd = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const b of filteredBookings) {
      const dateObj = new Date(b.appointmentDateTime);
      const ymd = formatYmd(dateObj);
      if (!map.has(ymd)) map.set(ymd, []);
      map.get(ymd)!.push(b);
    }
    return map;
  }, [filteredBookings]);

  return (
    <div className="space-y-6">
      {/* Top Warning Banner for Unassigned Bookings */}
      {unassignedCount > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-amber-900">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {unassignedCount}
            </span>
            <div>
              <p className="font-semibold text-sm">
                {unassignedCount} Unassigned Booking{unassignedCount > 1 ? 's' : ''} Require Attention
              </p>
              <p className="text-xs text-amber-700">
                Bookings without an assigned therapist are highlighted in bright orange below.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedTherapistId('UNASSIGNED')}
            className="px-3.5 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition-colors"
          >
            Filter Unassigned
          </button>
        </div>
      )}

      {/* Controls & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 space-y-4">
        {/* Navigation & View Toggle Row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrev}
              className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold text-xs"
              aria-label="Previous"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 font-semibold text-xs border border-emerald-200 hover:bg-emerald-100"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold text-xs"
              aria-label="Next"
            >
              Next →
            </button>
            <span className="ml-2 font-bold text-slate-800 text-sm">
              {currentDate.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
                ...(viewMode === 'day' ? { day: 'numeric' } : {}),
              })}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                viewMode === 'day' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                viewMode === 'week' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                viewMode === 'month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month
            </button>
          </div>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Therapist Filter */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Therapist</label>
            <select
              value={selectedTherapistId}
              onChange={(e) => setSelectedTherapistId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
            >
              <option value="ALL">All Therapists</option>
              <option value="UNASSIGNED">⚠️ Unassigned Only</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Service Filter */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Service</label>
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
            >
              <option value="ALL">All Services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="ASSIGNED">ASSIGNED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="REFUNDED">REFUNDED</option>
              <option value="NO_SHOW">NO_SHOW</option>
            </select>
          </div>

          {/* Location Type Filter */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Location Type</label>
            <select
              value={selectedLocationType}
              onChange={(e) => setSelectedLocationType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 font-medium"
            >
              <option value="ALL">All Locations</option>
              <option value="STUDIO">Studio Session</option>
              <option value="IN_HOME">In-Home Session</option>
            </select>
          </div>
        </div>
      </div>

      {/* Calendar Grid View */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        {/* Calendar Grid Headers */}
        <div
          className={`grid border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 ${
            viewMode === 'day'
              ? 'grid-cols-1'
              : viewMode === 'week'
              ? 'grid-cols-7'
              : 'grid-cols-7'
          }`}
        >
          {daysHeader.slice(0, viewMode === 'day' ? 1 : 7).map((d) => (
            <div key={d.toISOString()} className="p-3 text-center border-r border-slate-200 last:border-r-0">
              <div>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
              <div className="text-slate-900 text-sm font-black">{d.getUTCDate()}</div>
            </div>
          ))}
        </div>

        {/* Days Content Grid */}
        <div
          className={`grid min-h-[500px] divide-x divide-slate-200 ${
            viewMode === 'day'
              ? 'grid-cols-1'
              : viewMode === 'week'
              ? 'grid-cols-7'
              : 'grid-cols-7'
          }`}
        >
          {daysHeader.map((d) => {
            const ymd = formatYmd(d);
            const dayBookings = bookingsByYmd.get(ymd) || [];

            return (
              <div
                key={d.toISOString()}
                className={`p-2 space-y-2 border-b border-slate-100 ${
                  formatYmd(new Date()) === ymd ? 'bg-emerald-50/30' : ''
                }`}
              >
                {viewMode === 'month' && (
                  <div className="text-[10px] text-slate-400 font-bold mb-1">
                    {d.getUTCDate()}
                  </div>
                )}

                {dayBookings.length === 0 ? (
                  <div className="text-[11px] text-slate-400 italic text-center py-4">No appointments</div>
                ) : (
                  dayBookings.map((b) => {
                    const isUnassigned = !b.therapistId;

                    return (
                      <Link
                        key={b.id}
                        href={`/admin/bookings/${b.id}`}
                        className={`block p-2.5 rounded-xl border text-xs transition-all hover:shadow-md ${
                          isUnassigned
                            ? 'bg-amber-50 border-amber-300 hover:border-amber-500 text-amber-950'
                            : b.status === 'CANCELLED' || b.status === 'REFUNDED'
                            ? 'bg-slate-50 border-slate-200 text-slate-500 line-through'
                            : b.status === 'CONFIRMED'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                            : 'bg-blue-50 border-blue-200 text-blue-950'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold text-[11px] mb-1">
                          <span>{formatTime(b.appointmentDateTime)}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-black ${
                              isUnassigned
                                ? 'bg-amber-200 text-amber-900'
                                : b.status === 'CONFIRMED'
                                ? 'bg-emerald-200 text-emerald-900'
                                : 'bg-slate-200 text-slate-800'
                            }`}
                          >
                            {b.status}
                          </span>
                        </div>

                        <div className="font-extrabold text-slate-900 truncate">{b.customerName}</div>
                        <div className="text-[11px] text-slate-600 truncate">{b.serviceName}</div>

                        <div className="mt-1 flex items-center justify-between text-[10px]">
                          <span className={isUnassigned ? 'font-black text-amber-700' : 'text-slate-600 font-medium'}>
                            {isUnassigned ? '⚠️ Unassigned' : b.therapistName}
                          </span>
                          <span className="font-semibold text-slate-500">
                            {b.locationType === 'STUDIO' ? 'Studio' : 'In-Home'}
                          </span>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
