import React from 'react';
import Link from 'next/link';

export function TherapistNotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-16 bg-slate-50 text-center">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 mb-4">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
      <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-2">
        Therapist Not Found
      </h1>
      <p className="text-slate-600 max-w-md mb-6 text-sm sm:text-base">
        The therapist profile you are looking for does not exist or may have been updated.
      </p>
      <Link
        href="/find-a-therapist"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 transition-colors shadow-xs"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Find a Therapist
      </Link>
    </div>
  );
}
