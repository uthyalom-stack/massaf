'use client';

import React, { useState } from 'react';
import { MockTherapist } from '@/types/customer';
import { TherapistCard } from '@/components/customer/TherapistCard';

interface TherapistResultsProps {
  therapists: MockTherapist[];
  onResetFilters: () => void;
  hasActiveFilters: boolean;
}

export function TherapistResults({
  therapists,
  onResetFilters,
  hasActiveFilters,
}: TherapistResultsProps) {
  const [matchRequested, setMatchRequested] = useState(false);

  const handleMatchRequest = () => {
    setMatchRequested(true);
  };

  return (
    <div className="space-y-6">
      {/* Results Header / Result Count */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
            {therapists.length === 1
              ? '1 Therapist Found'
              : `${therapists.length} Therapists Available`}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            {therapists.length > 0
              ? 'Book direct appointments or request specialized bodywork.'
              : 'No licensed therapists currently match all your exact filter criteria.'}
          </p>
        </div>

        {hasActiveFilters && therapists.length > 0 && (
          <button
            type="button"
            onClick={onResetFilters}
            className="self-start sm:self-auto text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline transition-colors cursor-pointer focus:outline-none"
          >
            Show all therapists
          </button>
        )}
      </div>

      {/* Results Grid or Empty State */}
      {therapists.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {therapists.map((therapist) => (
            <TherapistCard key={therapist.id} therapist={therapist} />
          ))}
        </div>
      ) : (
        /* Useful Empty State UI */
        <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200 text-center shadow-xs space-y-6 max-w-2xl mx-auto">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900">
              No Direct Matching Therapists Found
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              We couldn&apos;t find an exact match for your combination of location, ZIP code, or service type. Try broadening your location parameters or request custom therapist matching.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={onResetFilters}
                className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 border border-slate-300 rounded-xl text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 cursor-pointer"
              >
                Reset Search Filters
              </button>
            )}

            <button
              type="button"
              onClick={handleMatchRequest}
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm rounded-xl transition-colors shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 cursor-pointer"
            >
              Match Me With A Therapist
            </button>
          </div>

          {/* Match Request Feedback Banner */}
          {matchRequested && (
            <div className="mt-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-left space-y-2 text-xs sm:text-sm text-emerald-900 animate-fadeIn">
              <div className="flex items-center gap-2 font-bold text-emerald-900">
                <svg
                  className="w-5 h-5 text-emerald-600 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Matching Preference Noted
              </div>
              <p className="text-emerald-800 leading-relaxed">
                Thank you for your interest! Automated therapist matching and concierge assignment will be enabled in an upcoming platform release. In the meantime, try clearing your search filters to explore available practitioners in nearby service areas.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
