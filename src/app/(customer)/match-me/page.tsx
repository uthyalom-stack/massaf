import React from 'react';
import { getActiveServices } from '@/lib/db-therapists';
import { MatchWizard } from '@/components/customer/MatchWizard';

export const dynamic = 'force-dynamic';

export default async function MatchMePage() {
  const activeServices = await getActiveServices();

  return (
    <div className="py-10 sm:py-16 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Page Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-100/80 text-emerald-900 border border-emerald-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            Therapist Recommendation System
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            Match Me With A Therapist
          </h1>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            Answer a few quick questions about your massage preferences, location, budget, and timing. Our matching algorithm will rank available therapists suited to your requirements.
          </p>
        </div>

        {/* Interactive Questionnaire Wizard */}
        <MatchWizard services={activeServices} />
      </div>
    </div>
  );
}
