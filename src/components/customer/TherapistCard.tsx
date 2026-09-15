import React from 'react';
import Image from 'next/image';
import { MockTherapist } from '@/types/customer';
import { RatingDisplay } from '@/components/ui/RatingDisplay';

interface TherapistCardProps {
  therapist: MockTherapist;
}

export function TherapistCard({ therapist }: TherapistCardProps) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl bg-white border border-slate-200 shadow-sm transition-all duration-200 hover:shadow-md hover:border-slate-300">
      {/* Image Container */}
      <div className="relative h-64 w-full overflow-hidden bg-slate-100">
        <Image
          src={therapist.image}
          alt={therapist.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />

        {/* Availability Badge */}
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white/95 backdrop-blur-sm text-emerald-800 shadow-xs ring-1 ring-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            {therapist.availability}
          </span>
        </div>

        {/* Location Type Badges */}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1">
          {therapist.offersInHome && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-900/80 backdrop-blur-xs text-white">
              In-Home
            </span>
          )}
          {therapist.offersStudio && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-900/80 backdrop-blur-xs text-white">
              Studio
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
              {therapist.name}
            </h3>
            <p className="text-xs font-medium text-slate-500">{therapist.title}</p>
          </div>
        </div>

        {/* Rating & Location */}
        <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
          <RatingDisplay rating={therapist.rating} reviewCount={therapist.reviewCount} size="sm" />
          <span className="truncate font-medium text-slate-600 flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {therapist.location}
          </span>
        </div>

        {/* Specialties tags */}
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {therapist.specialties.map((specialty) => (
            <span
              key={specialty}
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700"
            >
              {specialty}
            </span>
          ))}
        </div>

        {/* Footer info & CTA */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 block">Starting from</span>
            <span className="text-lg font-bold text-slate-900">${therapist.startingPrice}</span>
            <span className="text-xs text-slate-500 font-normal"> / session</span>
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 cursor-pointer"
          >
            View Profile
          </button>
        </div>
      </div>
    </div>
  );
}
