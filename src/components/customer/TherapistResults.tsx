'use client';

import React from 'react';
import Link from 'next/link';
import { CustomerTherapist } from '@/types/customer';
import { TherapistCard } from '@/components/customer/TherapistCard';

interface TherapistResultsProps {
  therapists: CustomerTherapist[];
  onResetFilters: () => void;
  hasActiveFilters: boolean;
  isSearching?: boolean;
  searchedZip?: string | null;
}

export function TherapistResults({
  therapists,
  onResetFilters,
  hasActiveFilters,
  isSearching = false,
  searchedZip = null,
}: TherapistResultsProps) {
  return (
    <div className="space-y-6">
      {/* Results Header / Result Count */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            {isSearching ? (
              <span className="text-emerald-700 animate-pulse">Searching for therapists...</span>
            ) : therapists.length === 1 ? (
              '1 Therapist Found'
            ) : (
              `${therapists.length} Therapists Available`
            )}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            {isSearching
              ? 'Filtering database for matching therapists near your selected area...'
              : therapists.length > 0
              ? 'Book direct appointments or request specialized bodywork.'
              : searchedZip
              ? `No therapists are currently available in ${searchedZip}.`
              : 'No licensed therapists currently match all your exact filter criteria.'}
          </p>
        </div>

        {hasActiveFilters && therapists.length > 0 && !isSearching && (
          <button
            type="button"
            onClick={onResetFilters}
            className="self-start sm:self-auto text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline transition-colors cursor-pointer focus:outline-none"
          >
            Show all therapists
          </button>
        )}
      </div>

      {/* Results Grid, Searching State, or Truthful Empty State */}
      {isSearching ? (
        <div className="py-16 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700">Loading matching therapists...</p>
        </div>
      ) : therapists.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {therapists.map((therapist) => (
            <TherapistCard key={therapist.id} therapist={therapist} />
          ))}
        </div>
      ) : (
        /* Truthful Empty State UI */
        <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200 text-center shadow-xs space-y-6 max-w-2xl mx-auto">
          <div className="w-16 h-16 bg-amber-50 text-amber-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
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
              {searchedZip
                ? `No Therapists Available in ${searchedZip}`
                : 'No Direct Matching Therapists Found'}
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              {searchedZip
                ? `ZIP code ${searchedZip} is a valid U.S. location, but no active therapists in our network are currently assigned to cover this area.`
                : 'We couldn\'t find an exact match for your combination of location or service filters. Try expanding your search or clearing active filters.'}
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

            <Link
              href="/match-me"
              className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm rounded-xl transition-colors shadow-xs"
            >
              Match Me With A Therapist
            </Link>
          </div>

          {/* Informational Note */}
          <div className="mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-1.5 text-xs sm:text-sm text-slate-700">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <svg
                className="w-4 h-4 text-emerald-700 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Therapist Matching Assistant
            </div>
            <p className="text-slate-600 leading-relaxed text-xs">
              Need help finding the right therapist? Take our quick questionnaire or click <strong>Reset Search Filters</strong> to browse all active therapists in our network.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
