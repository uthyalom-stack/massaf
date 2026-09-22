import React, { Suspense } from 'react';
import Link from 'next/link';
import { getActiveTherapists, getActiveServices } from '@/lib/db-therapists';
import { TherapistDiscoveryClient } from '@/components/customer/TherapistDiscoveryClient';

export const dynamic = 'force-dynamic';

export default async function FindTherapistPage() {
  const [dbTherapists, activeServices] = await Promise.all([
    getActiveTherapists(),
    getActiveServices(),
  ]);

  return (
    <div className="py-10 sm:py-16 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Page Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100/80 text-emerald-900 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            Therapist Network
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
            Find a Massage Therapist
          </h1>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            Discover massage therapy professionals available for in-home visits or local studio appointments near you.
          </p>
        </div>

        {/* Match Me Promotional Banner */}
        <div className="bg-radial from-emerald-900 to-slate-900 text-white rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-md border border-emerald-800/50">
          <div className="space-y-1 text-center md:text-left">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Not sure who to pick?
            </span>
            <h2 className="text-xl sm:text-2xl font-black">
              Let Us Match You With The Right Therapist
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
              Answer 4 short questions about your treatment preferences, location, and budget to get custom therapist recommendations.
            </p>
          </div>

          <Link
            href="/match-me"
            className="shrink-0 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm rounded-xl transition-all shadow-sm cursor-pointer"
          >
            Match Me With A Therapist &rarr;
          </Link>
        </div>

        {/* Discovery Content wrapped in Suspense for useSearchParams */}
        <Suspense
          fallback={
            <div className="p-12 text-center text-slate-500 font-medium">
              Loading therapist directory...
            </div>
          }
        >
          <TherapistDiscoveryClient
            initialTherapists={dbTherapists}
            availableServices={activeServices}
          />
        </Suspense>
      </div>
    </div>
  );
}
