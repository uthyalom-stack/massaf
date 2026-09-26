'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { rescheduleBookingAdminAction, TherapistChecklistResult } from '@/app/admin/actions';

interface BookingRescheduleSectionProps {
  bookingId: string;
  currentDateTimeISO: string;
  therapistId: string | null;
  availableTherapists: { id: string; name: string }[];
  isCancellable: boolean;
}

export function BookingRescheduleSection({
  bookingId,
  currentDateTimeISO,
  therapistId,
  availableTherapists,
  isCancellable,
}: BookingRescheduleSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const currentDateObj = new Date(currentDateTimeISO);
  const defaultYmd = currentDateObj.toISOString().split('T')[0];
  const defaultHhMm = `${String(currentDateObj.getUTCHours()).padStart(2, '0')}:${String(
    currentDateObj.getUTCMinutes()
  ).padStart(2, '0')}`;

  const [newDate, setNewDate] = useState<string>(defaultYmd);
  const [newTime, setNewTime] = useState<string>(defaultHhMm);
  const [selectedTherapistId, setSelectedTherapistId] = useState<string>(therapistId || '');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<TherapistChecklistResult['checklist'] | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setChecklist(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await rescheduleBookingAdminAction({
        bookingId,
        newDate,
        newTime,
        newTherapistId: selectedTherapistId || undefined,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Reschedule validation failed.');
        if (res.checklist) {
          setChecklist(res.checklist);
        }
      } else {
        setSuccessMsg('Appointment successfully rescheduled!');
        setIsOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Reschedule Appointment
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Modify date, time, or assigned therapist with full schedule & conflict validation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={!isCancellable}
          className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors disabled:opacity-50"
        >
          {isOpen ? 'Close Form' : 'Reschedule Date/Time'}
        </button>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          ✓ {successMsg}
        </div>
      )}

      {isOpen && (
        <form onSubmit={handleRescheduleSubmit} className="space-y-4 text-xs pt-2">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 space-y-2">
              <div className="font-bold">✕ {errorMsg}</div>
              {checklist && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2 border-t border-rose-200 text-[11px]">
                  {Object.entries(checklist).map(([key, item]) => (
                    <div
                      key={key}
                      className={item.pass ? 'text-emerald-700 font-medium' : 'text-rose-700 font-bold'}
                    >
                      {item.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="new-date" className="block text-slate-700 font-semibold mb-1">
                New Appointment Date
              </label>
              <input
                id="new-date"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="new-time" className="block text-slate-700 font-semibold mb-1">
                New Start Time (24h UTC)
              </label>
              <input
                id="new-time"
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium focus:ring-2 focus:ring-emerald-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="therapist-reassign" className="block text-slate-700 font-semibold mb-1">
              Therapist Assignment (Optional)
            </label>
            <select
              id="therapist-reassign"
              value={selectedTherapistId}
              onChange={(e) => setSelectedTherapistId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-medium focus:ring-2 focus:ring-emerald-600 focus:outline-none"
            >
              <option value="">Unassigned</option>
              {availableTherapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Validating...' : 'Confirm Reschedule'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
