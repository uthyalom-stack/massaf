import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { MatchedTherapistResult } from '@/lib/matching';
import { MatchCriteria } from '@/lib/validations/matching';
import { RatingDisplay } from '@/components/ui/RatingDisplay';

interface MatchResultsProps {
  results: MatchedTherapistResult[];
  criteria: MatchCriteria;
  onStartOver: () => void;
}

export function MatchResults({ results, criteria, onStartOver }: MatchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6 shadow-xs">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-500">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-slate-900">
            No Exact Therapist Matches Found
          </h2>
          <p className="text-slate-600 text-sm leading-relaxed max-w-md mx-auto">
            We couldn&apos;t find an active therapist matching all your selected criteria (service, location, budget, or date).
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={onStartOver}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-sm cursor-pointer"
          >
            Adjust Criteria & Try Again
          </button>

          <Link
            href="/find-a-therapist"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 font-semibold text-white transition-colors text-sm text-center shadow-xs"
          >
            Browse All Therapists
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Top Banner / Summary */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-5">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
            Matching Results
          </span>
          <h2 className="text-xl font-black text-slate-900">
            Found {results.length} Matched Therapist{results.length > 1 ? 's' : ''}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Ranked based on service compatibility, location coverage, budget fit, and ratings.
          </p>
        </div>

        <button
          type="button"
          onClick={onStartOver}
          className="shrink-0 px-3.5 py-1.5 rounded-lg border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100/50 font-semibold text-xs transition-colors cursor-pointer"
        >
          Change Questionnaire Choices
        </button>
      </div>

      {/* Matched Cards List */}
      <div className="space-y-6">
        {results.map(({ therapist, matchScore, matchedService, reasons }) => {
          const profileHref = `/therapists/${therapist.id}`;

          // Build pre-filled booking URL
          const bookingParams = new URLSearchParams({
            therapistId: therapist.id,
            serviceId: matchedService.id,
            locationType: criteria.locationType,
          });

          if (criteria.preferredDate) {
            bookingParams.set('date', criteria.preferredDate);
          }

          if (criteria.zipCode) {
            bookingParams.set('zipCode', criteria.zipCode);
          }

          const bookingHref = `/booking?${bookingParams.toString()}`;

          return (
            <div
              key={therapist.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:border-slate-300 transition-all overflow-hidden flex flex-col md:flex-row"
            >
              {/* Image & Score Container */}
              <div className="relative md:w-64 h-56 md:h-auto shrink-0 bg-slate-100">
                <Image
                  src={therapist.image}
                  alt={therapist.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 256px"
                  className="object-cover"
                />

                {/* Score Badge */}
                <div className="absolute top-3 left-3">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black bg-emerald-800 text-white shadow-md">
                    <svg className="w-3.5 h-3.5 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    {matchScore}% Match
                  </span>
                </div>

                {/* Location Badge */}
                <div className="absolute bottom-3 left-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-900/80 backdrop-blur-xs text-white">
                    {criteria.locationType === 'IN_HOME' ? 'In-Home Visit' : 'Studio Session'}
                  </span>
                </div>
              </div>

              {/* Content Body */}
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 hover:text-emerald-700 transition-colors">
                        <Link href={profileHref}>{therapist.name}</Link>
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <RatingDisplay rating={therapist.rating} reviewCount={therapist.reviewCount} size="sm" />
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-xs text-slate-600 font-medium">
                          {therapist.location}
                        </span>
                      </div>
                    </div>

                    <div className="text-left sm:text-right bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded-lg shrink-0">
                      <span className="text-xs text-slate-500 block">Matched Service Price</span>
                      <span className="text-xl font-extrabold text-slate-900">${matchedService.price}</span>
                      <span className="text-xs text-slate-500 font-normal"> / {matchedService.durationMinutes} min</span>
                    </div>
                  </div>

                  {/* Honest Match Explanations */}
                  <div className="pt-2">
                    <span className="text-xs font-semibold text-slate-700 block mb-1.5 uppercase tracking-wider">
                      Why this practitioner matches you:
                    </span>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {reasons.map((reason, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 mt-auto">
                  <Link
                    href={profileHref}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-xs text-center"
                  >
                    View Full Profile
                  </Link>

                  <Link
                    href={bookingHref}
                    className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 font-semibold text-white transition-colors text-xs text-center shadow-xs"
                  >
                    Book Appointment
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
