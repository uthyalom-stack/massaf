'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { formatUtcTimeString } from '@/lib/timezone';

export interface CalendarBooking {
  id: string;
  bookingNumber: string;
  appointmentDateTime: string; // ISO string
  durationMinutes: number;
  status: string;
  locationType: string;
  customerName: string;
  therapistId: string | null;
  therapistName: string | null;
  serviceId: string | null;
  serviceName: string;
}

export interface CalendarClientProps {
  initialBookings: CalendarBooking[];
  therapists: { id: string; name: string }[];
  services: { id: string; name: string }[];
}

export function CalendarClient({
  initialBookings,
  therapists,
  services,
}: CalendarClientProps) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Filters
  const [selectedTherapistId, setSelectedTherapistId] = useState<string>('ALL');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedLocationType, setSelectedLocationType] = useState<string>('ALL');

  // Filtered bookings
  const filteredBookings = useMemo(() => {
    return initialBookings.filter((b) => {
      if (selectedTherapistId !== 'ALL') {
        if (selectedTherapistId === 'UNASSIGNED') {
          if (b.therapistId !== null) return false;
        } else if (b.therapistId !== selectedTherapistId) {
          return false;
        }
      }
      if (selectedServiceId !== 'ALL' && b.serviceId !== selectedServiceId) {
        return false;
      }
      if (selectedStatus !== 'ALL' && b.status !== selectedStatus) {
        return false;
      }
      if (selectedLocationType !== 'ALL' && b.locationType !== selectedLocationType) {
        return false;
      }
      return true;
    });
  }, [initialBookings, selectedTherapistId, selectedServiceId, selectedStatus, selectedLocationType]);

  // Navigation helpers
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (view === 'day') next.setDate(next.getDate() - 1);
    if (view === 'week') next.setDate(next.getDate() - 7);
    if (view === 'month') next.setMonth(next.getMonth() - 1);
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (view === 'day') next.setDate(next.getDate() + 1);
    if (view === 'week') next.setDate(next.getDate() + 7);
    if (view === 'month') next.setMonth(next.getMonth() + 1);
    setCurrentDate(next);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Status color helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'PENDING':
      case 'UNASSIGNED':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'COMPLETED':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'CANCELLED':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  // Render Appointment Card
  const renderBookingCard = (booking: CalendarBooking, isCompact = false) => {
    const isUnassigned = !booking.therapistId;
    const formattedTime = formatUtcTimeString(booking.appointmentDateTime);

    return (
      <Link
        key={booking.id}
        href={`/admin/bookings/${booking.id}`}
        className={`block p-2 rounded-lg border transition-all text-xs mb-1.5 shadow-sm ${
          isUnassigned
            ? 'bg-amber-950/40 border-amber-500/40 hover:border-amber-400'
            : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
        }`}
      >
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="font-semibold text-white tracking-wide">{formattedTime}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] border uppercase font-medium ${getStatusBadge(booking.status)}`}>
            {booking.status}
          </span>
        </div>

        <div className="font-medium text-slate-200 truncate">{booking.customerName}</div>
        <div className="text-slate-400 truncate">{booking.serviceName} ({booking.durationMinutes}m)</div>

        {!isCompact && (
          <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
            <span className={isUnassigned ? 'text-amber-400 font-bold' : 'text-slate-300'}>
              {isUnassigned ? '⚠️ UNASSIGNED' : booking.therapistName}
            </span>
            <span className="text-slate-500 uppercase">{booking.locationType}</span>
          </div>
        )}
      </Link>
    );
  };

  // Month View Days
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startDay = firstDayOfMonth.getDay(); // 0 = Sun
    const daysInMonth = lastDayOfMonth.getDate();

    const days = [];
    // Previous month padding
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    // Month days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }, [currentDate]);

  // Week View Days
  const weekDays = useMemo(() => {
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day); // Sunday

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentDate]);

  return (
    <div className="space-y-6">
      {/* Controls & Filters Header */}
      <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Navigation Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleToday}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition"
            >
              Today
            </button>
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-800 p-0.5">
              <button
                onClick={handlePrev}
                className="px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white transition"
              >
                ←
              </button>
              <button
                onClick={handleNext}
                className="px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white transition"
              >
                →
              </button>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              {currentDate.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
                ...(view === 'day' ? { day: 'numeric' } : {}),
              })}
            </h2>
          </div>

          {/* View Toggles */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-1">
            <button
              onClick={() => setView('day')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                view === 'day' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Day
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                view === 'week' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                view === 'month' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Month
            </button>
          </div>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-800/60">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Therapist
            </label>
            <select
              value={selectedTherapistId}
              onChange={(e) => setSelectedTherapistId(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-700 bg-slate-900 text-slate-200 p-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
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

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Service
            </label>
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-700 bg-slate-900 text-slate-200 p-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ALL">All Services</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Booking Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-700 bg-slate-900 text-slate-200 p-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="PENDING">PENDING</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Location Type
            </label>
            <select
              value={selectedLocationType}
              onChange={(e) => setSelectedLocationType(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-700 bg-slate-900 text-slate-200 p-2 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ALL">All Locations</option>
              <option value="IN_HOME">IN_HOME</option>
              <option value="STUDIO">STUDIO</option>
            </select>
          </div>
        </div>
      </div>

      {/* Calendar Grid View */}
      {view === 'month' && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-xl">
          <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-900/80 text-center text-xs font-semibold text-slate-400 py-2.5">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-800/60 bg-slate-950">
            {monthDays.map((date, idx) => {
              if (!date) {
                return <div key={`empty-${idx}`} className="min-h-[120px] bg-slate-950/40 p-2" />;
              }

              const dateStr = date.toISOString().split('T')[0];
              const isToday = new Date().toISOString().split('T')[0] === dateStr;
              const dayBookings = filteredBookings.filter(
                (b) => b.appointmentDateTime.split('T')[0] === dateStr
              );

              return (
                <div
                  key={dateStr}
                  className={`min-h-[130px] p-2 transition hover:bg-slate-900/30 ${
                    isToday ? 'bg-indigo-950/20 ring-1 ring-inset ring-indigo-500/30' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-xs font-bold ${
                        isToday ? 'text-indigo-400 bg-indigo-500/20 px-1.5 py-0.5 rounded' : 'text-slate-400'
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    {dayBookings.length > 0 && (
                      <span className="text-[10px] font-medium text-slate-500">
                        {dayBookings.length} appt{dayBookings.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    {dayBookings.map((b) => renderBookingCard(b, true))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'week' && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden shadow-xl">
          <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-900/80 divide-x divide-slate-800 text-center py-3">
            {weekDays.map((d) => {
              const dateStr = d.toISOString().split('T')[0];
              const isToday = new Date().toISOString().split('T')[0] === dateStr;
              return (
                <div key={dateStr} className="px-2">
                  <div className="text-[11px] font-medium text-slate-400 uppercase">
                    {d.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div
                    className={`text-sm font-bold mt-0.5 ${
                      isToday ? 'text-indigo-400' : 'text-slate-200'
                    }`}
                  >
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-7 divide-x divide-slate-800/60 min-h-[450px]">
            {weekDays.map((d) => {
              const dateStr = d.toISOString().split('T')[0];
              const dayBookings = filteredBookings.filter(
                (b) => b.appointmentDateTime.split('T')[0] === dateStr
              );

              return (
                <div key={dateStr} className="p-2 space-y-2 bg-slate-950/60">
                  {dayBookings.length === 0 ? (
                    <div className="text-[11px] text-slate-600 text-center py-6">No appts</div>
                  ) : (
                    dayBookings.map((b) => renderBookingCard(b))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'day' && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-xl">
          <h3 className="text-base font-bold text-white mb-4">
            Appointments for {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h3>

          {(() => {
            const dateStr = currentDate.toISOString().split('T')[0];
            const dayBookings = filteredBookings.filter(
              (b) => b.appointmentDateTime.split('T')[0] === dateStr
            );

            if (dayBookings.length === 0) {
              return (
                <div className="text-center py-12 border border-dashed border-slate-800 rounded-lg text-slate-500 text-sm">
                  No appointments scheduled for this day.
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {dayBookings.map((b) => renderBookingCard(b))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
