'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RatingDisplay } from '@/components/ui/RatingDisplay';
import { updateReviewStatusAction } from '@/app/admin/actions';

export interface SerializedReviewDetail {
  id: string;
  rating: number;
  comment: string | null;
  authorName?: string | null;
  source?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  therapist: {
    id: string;
    name: string;
    bio: string | null;
    profileImage: string | null;
  };
  customer: {
    id: string;
    name: string;
    email: string;
  } | null;
  booking: {
    id: string;
    bookingNumber: string;
    appointmentDateTime: string;
    locationType: string;
    status: string;
    serviceName: string;
    durationMinutes: number;
  } | null;
}

interface ReviewDetailClientProps {
  review: SerializedReviewDetail;
}

export function ReviewDetailClient({ review }: ReviewDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [actionError, setActionError] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const handleStatusChange = async (status: 'PENDING' | 'APPROVED' | 'REJECTED') => {
    setActionError(null);
    setShowRejectModal(false);

    startTransition(async () => {
      const res = await updateReviewStatusAction({ reviewId: review.id, status });
      if (!res.success) {
        setActionError(res.error || 'Failed to update review status.');
      } else {
        router.refresh();
      }
    });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'PENDING':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'REJECTED':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div>
        <Link
          href="/admin/reviews"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-emerald-700 transition-colors py-1 px-2 -ml-2 rounded-md"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Reviews
        </Link>
      </div>

      {/* Header Banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Review Details
            </h1>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadgeClass(
                review.status
              )}`}
            >
              {review.status}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Submitted on {new Date(review.createdAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          {review.status !== 'APPROVED' && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleStatusChange('APPROVED')}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
            >
              Approve Review
            </button>
          )}

          {review.status !== 'REJECTED' && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setShowRejectModal(true)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Reject / Hide
            </button>
          )}

          {review.status !== 'PENDING' && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleStatusChange('PENDING')}
              className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Reset to Pending
            </button>
          )}
        </div>
      </div>

      {/* Global Error Banner */}
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-xs font-bold text-rose-600 hover:text-rose-800 underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Review Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column: Review Text & Rating */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Customer Rating
                </span>
                <RatingDisplay rating={review.rating} size="lg" showCount={false} />
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-slate-900">{review.rating} / 5</span>
                <span className="block text-xs text-slate-500 font-medium">Star Score</span>
              </div>
            </div>

            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Full Review Feedback
              </span>
              {review.comment ? (
                <p className="text-base sm:text-lg text-slate-800 leading-relaxed font-serif bg-slate-50 p-6 rounded-2xl border border-slate-200/70 italic">
                  &ldquo;{review.comment}&rdquo;
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic py-4">
                  No written comment was included with this rating submission.
                </p>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-xs text-slate-500">
              <div>
                <span className="font-semibold text-slate-700 block">Created Timestamp</span>
                <span>{new Date(review.createdAt).toISOString()}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-700 block">Last Updated Timestamp</span>
                <span>{new Date(review.updatedAt).toISOString()}</span>
              </div>
            </div>
          </section>

          {/* Booking Context Section */}
          <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <h2 className="text-lg font-bold text-slate-900 pb-2 border-b border-slate-100">
              Associated Booking Context
            </h2>

            {review.booking ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Booking Reference</span>
                  <Link
                    href={`/admin/bookings/${review.booking.id}`}
                    className="font-mono font-bold text-emerald-700 hover:underline text-base"
                  >
                    #{review.booking.bookingNumber}
                  </Link>
                </div>

                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Service Name</span>
                  <span className="font-semibold text-slate-900">
                    {review.booking.serviceName} ({review.booking.durationMinutes} mins)
                  </span>
                </div>

                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Appointment Date</span>
                  <span className="text-slate-800 font-medium">
                    {new Date(review.booking.appointmentDateTime).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Location Type</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                    {review.booking.locationType === 'IN_HOME' ? 'In-Home Visit' : 'Studio Session'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No booking record attached.</p>
            )}
          </section>
        </div>

        {/* Right Sidebar: Therapist & Customer Details */}
        <div className="space-y-6">
          {/* Therapist Card */}
          <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
              Therapist Details
            </h3>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0">
                {review.therapist.name.charAt(0)}
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{review.therapist.name}</h4>
                <Link
                  href={`/admin/therapists/${review.therapist.id}`}
                  className="text-xs font-semibold text-emerald-700 hover:underline"
                >
                  View Therapist Profile &rarr;
                </Link>
              </div>
            </div>

            {review.therapist.bio && (
              <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                {review.therapist.bio}
              </p>
            )}
          </section>

          {/* Customer / Reviewer Card */}
          <section className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
              Reviewer Details
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block uppercase text-[10px]">Reviewer Name</span>
                <span className="font-bold text-slate-900 text-sm">
                  {review.authorName || review.customer?.name || 'Anonymous'}
                </span>
              </div>

              {review.customer && (
                <div>
                  <span className="text-slate-400 font-semibold block uppercase text-[10px]">Email Address</span>
                  <span className="font-mono text-slate-800">{review.customer.email}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Confirm Reject / Hide Review
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Are you sure you want to reject and hide this review? It will be hidden from public display on the therapist profile, but the review record will remain safely stored in the database.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleStatusChange('REJECTED')}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-700 text-white hover:bg-rose-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
