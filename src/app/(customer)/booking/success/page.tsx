'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { formatUtcDateString, formatUtcTimeString } from '@/lib/timezone';
import { ReviewForm } from '@/components/customer/ReviewForm';

interface BookingDetails {
  id: string;
  bookingNumber: string;
  status: string;
  paymentStatus: string;
  amount: number;
  appointmentDateTime: string;
  durationMinutes: number;
  locationType: string;
  therapistName: string;
  serviceName: string;
  hasReview: boolean;
  existingReview?: {
    rating: number;
    comment: string | null;
    status: string;
  } | null;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('id');

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadBooking() {
      if (!bookingId) {
        if (!ignore) {
          setError('No booking ID provided.');
          setLoading(false);
        }
        return;
      }

      try {
        const res = await fetch(`/api/bookings/details?id=${bookingId}`);
        const data = await res.json();

        if (ignore) return;

        if (!res.ok) {
          setError(data.error || 'Unable to load booking confirmation.');
        } else {
          setBooking(data.booking);
        }
      } catch (err) {
        console.error('Error fetching booking details:', err);
        if (!ignore) {
          setError('A network error occurred while loading confirmation details.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadBooking();

    return () => {
      ignore = true;
    };
  }, [bookingId]);

  const fetchBooking = useCallback(async () => {
    if (!bookingId) return;
    try {
      const res = await fetch(`/api/bookings/details?id=${bookingId}`);
      const data = await res.json();
      if (res.ok) {
        setBooking(data.booking);
      }
    } catch (err) {
      console.error('Error refreshing booking details:', err);
    }
  }, [bookingId]);

  if (loading) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 shadow-xs">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-600 text-sm font-medium">Retrieving your appointment confirmation...</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-3xl border border-rose-200 p-8 text-center space-y-6 shadow-xs">
        <div className="w-14 h-14 bg-rose-100 text-rose-700 rounded-2xl flex items-center justify-center mx-auto">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Booking Confirmation Error</h1>
          <p className="text-slate-600 text-sm leading-relaxed">
            {error || 'The requested booking record could not be found.'}
          </p>
        </div>
        <Link
          href="/find-a-therapist"
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-emerald-700 text-white font-semibold text-sm hover:bg-emerald-800 transition-colors"
        >
          Return to Find a Therapist
        </Link>
      </div>
    );
  }

  const formattedDate = formatUtcDateString(booking.appointmentDateTime);
  const formattedTime = formatUtcTimeString(booking.appointmentDateTime);
  const isCompleted = booking.status === 'COMPLETED';

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 p-6 sm:p-10 shadow-xs space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-800 rounded-3xl flex items-center justify-center mx-auto shadow-xs">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Appointment Requested!
        </h1>
        <p className="text-slate-600 text-sm max-w-md mx-auto">
          Your massage appointment request has been successfully created and saved in our system.
        </p>
      </div>

      {/* Booking Reference Card */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200/80">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Booking Reference
            </span>
            <span className="text-xl font-mono font-bold text-slate-900">
              {booking.bookingNumber}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${
                booking.status === 'COMPLETED'
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}
            >
              Booking: {booking.status}
            </span>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
              Payment: {booking.paymentStatus}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm pt-2">
          <div>
            <span className="text-xs text-slate-500 block">Therapist</span>
            <span className="font-bold text-slate-900">{booking.therapistName}</span>
          </div>

          <div>
            <span className="text-xs text-slate-500 block">Service</span>
            <span className="font-bold text-slate-900">{booking.serviceName} ({booking.durationMinutes} mins)</span>
          </div>

          <div>
            <span className="text-xs text-slate-500 block">Date</span>
            <span className="font-semibold text-slate-800">{formattedDate}</span>
          </div>

          <div>
            <span className="text-xs text-slate-500 block">Time</span>
            <span className="font-semibold text-slate-800">{formattedTime}</span>
          </div>

          <div>
            <span className="text-xs text-slate-500 block">Location</span>
            <span className="font-semibold text-slate-800">
              {booking.locationType === 'STUDIO' ? 'Studio' : 'In-Home'}
            </span>
          </div>

          <div>
            <span className="text-xs text-slate-500 block">Amount</span>
            <span className="text-lg font-extrabold text-emerald-800">${booking.amount}</span>
          </div>
        </div>
      </div>

      {/* Explicit Payment Explanation Notice */}
      <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/80 text-amber-900 space-y-1 text-xs">
        <span className="font-bold uppercase tracking-wider block">Important Payment Notice</span>
        <p className="leading-relaxed text-amber-800">
          Payment for this booking has <strong>NOT</strong> been processed yet. The booking has been saved as <strong>Payment: Pending</strong>. Complete payment options will be provided in an upcoming platform release.
        </p>
      </div>

      {/* Review Section Connection */}
      <div className="pt-2 border-t border-slate-100">
        {!isCompleted ? (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-600 text-xs text-center space-y-1">
            <span className="font-semibold text-slate-800 block">Review Option</span>
            <p className="text-slate-500">
              Your review will become available after your appointment is completed.
            </p>
          </div>
        ) : booking.hasReview ? (
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-900 text-xs text-center space-y-1">
            <span className="font-bold block text-sm">Review Submitted</span>
            <p className="text-emerald-800">
              Thank you! Your review for this appointment has been received and is currently in moderation.
            </p>
          </div>
        ) : (
          <ReviewForm
            bookingId={booking.id}
            therapistName={booking.therapistName}
            onSuccess={fetchBooking}
          />
        )}
      </div>

      {/* Navigation CTA */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link
          href="/find-a-therapist"
          className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-emerald-700 text-white font-bold text-sm hover:bg-emerald-800 transition-colors text-center"
        >
          Explore More Therapists
        </Link>
        <Link
          href="/"
          className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition-colors text-center"
        >
          Return to Home
        </Link>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 flex items-center justify-center">
      <Suspense fallback={<div className="text-center text-slate-500">Loading confirmation page...</div>}>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
