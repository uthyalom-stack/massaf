'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RatingDisplay } from '@/components/ui/RatingDisplay';
import { updateReviewStatusAction } from '@/app/admin/actions';

export interface SerializedReview {
  id: string;
  rating: number;
  comment: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  isPublished: boolean;
  createdAt: string;
  therapist: {
    id: string;
    name: string;
    profileImage: string | null;
  };
  customer: {
    id: string;
    name: string;
    email: string;
  };
  booking: {
    id: string;
    bookingNumber: string;
    appointmentDateTime: string;
    serviceName: string;
  } | null;
}

export interface TherapistOption {
  id: string;
  name: string;
}

interface ReviewListProps {
  initialReviews: SerializedReview[];
  therapists: TherapistOption[];
  currentSearch?: string;
  currentStatus?: string;
  currentTherapistId?: string;
}

export function ReviewList({
  initialReviews,
  therapists,
  currentSearch = '',
  currentStatus = 'ALL',
  currentTherapistId = 'ALL',
}: ReviewListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Search and filter state
  const [search, setSearch] = useState(currentSearch);
  const [statusFilter, setStatusFilter] = useState(currentStatus);
  const [therapistFilter, setTherapistFilter] = useState(currentTherapistId);

  // Moderation state
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingReview, setConfirmingReview] = useState<{
    id: string;
    targetStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  } | null>(null);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters(search, statusFilter, therapistFilter);
  };

  const applyFilters = (newSearch: string, newStatus: string, newTherapist: string) => {
    const params = new URLSearchParams();
    if (newSearch.trim()) params.set('search', newSearch.trim());
    if (newStatus && newStatus !== 'ALL') params.set('status', newStatus);
    if (newTherapist && newTherapist !== 'ALL') params.set('therapistId', newTherapist);

    startTransition(() => {
      router.push(`/admin/reviews${params.toString() ? `?${params.toString()}` : ''}`);
    });
  };

  const handleStatusChange = async (reviewId: string, status: 'PENDING' | 'APPROVED' | 'REJECTED') => {
    setActionError(null);
    setConfirmingReview(null);

    startTransition(async () => {
      const res = await updateReviewStatusAction({ reviewId, status });
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
      {/* Search and Filters Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
        <form onSubmit={handleFilterSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-4">
          {/* Search Box */}
          <div className="sm:col-span-5">
            <label htmlFor="review-search" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Search Reviews
            </label>
            <div className="relative">
              <input
                id="review-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search text, customer, therapist, booking #..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent bg-slate-50/50"
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Status Filter */}
          <div className="sm:col-span-3">
            <label htmlFor="status-filter" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                applyFilters(search, e.target.value, therapistFilter);
              }}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent bg-slate-50/50"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Approval</option>
              <option value="APPROVED">Approved (Public)</option>
              <option value="REJECTED">Rejected (Hidden)</option>
            </select>
          </div>

          {/* Therapist Filter */}
          <div className="sm:col-span-4">
            <label htmlFor="therapist-filter" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Therapist
            </label>
            <select
              id="therapist-filter"
              value={therapistFilter}
              onChange={(e) => {
                setTherapistFilter(e.target.value);
                applyFilters(search, statusFilter, e.target.value);
              }}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent bg-slate-50/50"
            >
              <option value="ALL">All Therapists</option>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </form>
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

      {/* Review Cards Grid / List */}
      {initialReviews.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {search || statusFilter !== 'ALL' || therapistFilter !== 'ALL'
              ? 'No reviews found'
              : 'No reviews yet'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {search || statusFilter !== 'ALL' || therapistFilter !== 'ALL'
              ? 'Try adjusting your search criteria or filter selections.'
              : 'Submitted customer reviews will appear here for moderation.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {initialReviews.map((review) => {
            const commentPreview = review.comment
              ? review.comment.length > 180
                ? `${review.comment.substring(0, 180)}...`
                : review.comment
              : 'No written comment provided.';

            return (
              <div
                key={review.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-start justify-between gap-6"
              >
                {/* Left Column: Rating, Comment, Meta */}
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <RatingDisplay rating={review.rating} size="sm" showCount={false} />
                    <span className="text-xs font-semibold text-slate-500">
                      {review.rating} / 5 stars
                    </span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusBadgeClass(
                        review.status
                      )}`}
                    >
                      {review.status}
                    </span>
                  </div>

                  <p className="text-sm text-slate-700 leading-relaxed italic">
                    &ldquo;{commentPreview}&rdquo;
                  </p>

                  {/* Related entities context summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs text-slate-600 border-t border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Therapist</span>
                      <span className="font-semibold text-slate-900">{review.therapist.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Customer</span>
                      <span className="font-semibold text-slate-900">{review.customer.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Booking Reference</span>
                      {review.booking ? (
                        <Link
                          href={`/admin/bookings/${review.booking.id}`}
                          className="font-mono font-semibold text-emerald-700 hover:underline"
                        >
                          #{review.booking.bookingNumber}
                        </Link>
                      ) : (
                        <span className="text-slate-400 italic">N/A</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column: Date & Actions */}
                <div className="flex flex-col sm:flex-row md:flex-col justify-between items-start md:items-end gap-3 shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
                  <div className="text-xs text-slate-400 text-left md:text-right">
                    <span>Submitted {new Date(review.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/admin/reviews/${review.id}`}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors"
                    >
                      View Details
                    </Link>

                    {/* Moderation Controls */}
                    {review.status !== 'APPROVED' && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleStatusChange(review.id, 'APPROVED')}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        Approve
                      </button>
                    )}

                    {review.status !== 'REJECTED' && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setConfirmingReview({ id: review.id, targetStatus: 'REJECTED' })}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        Reject / Hide
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Reject/Hide */}
      {confirmingReview && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Confirm Reject / Hide Review
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Are you sure you want to reject and hide this review? It will be removed from public display on the therapist profile, but the review record will remain stored in the database for historical records.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmingReview(null)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleStatusChange(confirmingReview.id, 'REJECTED')}
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
