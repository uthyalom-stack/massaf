'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MOCK_THERAPISTS } from '@/lib/mock-data';

function BookingPlaceholderContent() {
  const searchParams = useSearchParams();
  const therapistId = searchParams.get('therapist');
  const serviceId = searchParams.get('service');

  const therapist = MOCK_THERAPISTS.find((t) => t.id === therapistId);
  const service = therapist?.services.find((s) => s.id === serviceId);

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 shadow-sm text-center space-y-6">
      <div className="w-16 h-16 bg-emerald-100 text-emerald-800 rounded-2xl flex items-center justify-center mx-auto">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>

      <div className="space-y-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-900">
          Phase 5 Feature Preview
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Booking Experience Coming Soon
        </h1>
        <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
          The full interactive scheduling, availability matching, and secure checkout workflow will be activated in the upcoming phase.
        </p>
      </div>

      {therapist && (
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 text-left space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Selected Practitioner
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-slate-900">{therapist.name}</p>
              <p className="text-xs text-slate-500">{therapist.title} • {therapist.location}</p>
            </div>
            {service && (
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900">${service.price}</p>
                <p className="text-xs text-slate-500">{service.durationMinutes} min {service.name}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
        {therapist ? (
          <Link
            href={`/therapists/${therapist.id}`}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-700 text-white font-semibold text-sm hover:bg-emerald-800 transition-colors"
          >
            Return to {therapist.name}&apos;s Profile
          </Link>
        ) : (
          <Link
            href="/find-a-therapist"
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-700 text-white font-semibold text-sm hover:bg-emerald-800 transition-colors"
          >
            Back to Find a Therapist
          </Link>
        )}
      </div>
    </div>
  );
}

export default function BookingPage() {
  return (
    <div className="min-h-[75vh] flex items-center justify-center py-12 px-4 bg-slate-50">
      <Suspense fallback={<div className="text-center text-slate-500">Loading booking page...</div>}>
        <BookingPlaceholderContent />
      </Suspense>
    </div>
  );
}
