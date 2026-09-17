import React from 'react';
import Link from 'next/link';

export const metadata = {
  title: 'Bookings Management | MASSAF Admin',
};

export default function BookingsPlaceholderPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Bookings Management</h1>
        <p className="text-slate-600 text-sm mt-1">
          Overview and status of customer booking appointments.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 max-w-2xl mx-auto my-12 shadow-xs">
        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-slate-900">Bookings Module Placeholder</h2>
          <p className="text-slate-600 text-sm leading-relaxed">
            Full administrative booking lifecycle management (assignment, status changes, and rescheduling) will be fully operational in subsequent phases.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
