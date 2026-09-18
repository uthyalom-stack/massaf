import React, { Suspense } from 'react';
import { getActiveTherapists } from '@/lib/db-therapists';
import { TherapistDiscoveryClient } from '@/components/customer/TherapistDiscoveryClient';

export const dynamic = 'force-dynamic';

export default async function FindTherapistPage() {
  const dbTherapists = await getActiveTherapists();

  return (
    <div className="py-10 sm:py-16 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Page Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100/80 text-emerald-900 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            Verified Practitioner Network
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            Find a Massage Therapist
          </h1>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            Discover licensed, background-checked massage therapy professionals available for in-home visits or local studio appointments near you.
          </p>
        </div>

        {/* Discovery Content wrapped in Suspense for useSearchParams */}
        <Suspense
          fallback={
            <div className="p-12 text-center text-slate-500 font-medium">
              Loading therapist directory...
            </div>
          }
        >
          <TherapistDiscoveryClient initialTherapists={dbTherapists} />
        </Suspense>
      </div>
    </div>
  );
}
