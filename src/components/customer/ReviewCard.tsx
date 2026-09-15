import React from 'react';
import { RatingDisplay } from '@/components/ui/RatingDisplay';

interface ReviewCardProps {
  reviewerName: string;
  location: string;
  rating: number;
  date: string;
  comment: string;
  title?: string;
  therapistName?: string;
  serviceType?: string;
  verifiedBooking?: boolean;
}

export function ReviewCard({
  reviewerName,
  location,
  rating,
  date,
  comment,
  title,
  therapistName,
  serviceType,
  verifiedBooking = true,
}: ReviewCardProps) {
  return (
    <div className="flex flex-col justify-between p-6 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-slate-300 transition-all">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <RatingDisplay rating={rating} showCount={false} size="sm" />
          <span className="text-xs text-slate-400">{date}</span>
        </div>

        {title && (
          <h4 className="text-base font-semibold text-slate-900 mb-2">
            {title}
          </h4>
        )}

        <p className="text-sm text-slate-600 leading-relaxed italic">
          &ldquo;{comment}&rdquo;
        </p>

        {therapistName && (
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            Therapist: <span className="font-medium text-slate-800">{therapistName}</span>
            {serviceType && <span className="block text-slate-400 mt-0.5">{serviceType}</span>}
          </div>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">{reviewerName}</p>
          <p className="text-xs text-slate-500">{location}</p>
        </div>

        {verifiedBooking && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
            <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Verified Client
          </span>
        )}
      </div>
    </div>
  );
}
