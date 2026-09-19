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
  const payErrorParam = searchParams.get('pay_error');

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payError, setPayError] = useState<boolean>(Boolean(payErrorParam));

  const loadBookingAndVerify = useCallback(async () => {
    if (!bookingId) {
      setError('No booking ID provided.');
      setLoading(false);
      return;
    }

    try {
      setVerifying(true);
      // Query payment status endpoint which re-checks PayLio if state is pending
      const statusRes = await fetch(`/api/payments/status?bookingId=${bookingId}`);
      if (statusRes.ok) {
        // Now fetch full customer display details
        const detailsRes = await fetch(`/api/bookings/details?id=${bookingId}`);
        const data = await detailsRes.json();
        if (detailsRes.ok) {
          setBooking(data.booking);
        } else {
          setError(data.error || 'Unable to load booking details.');
        }
      } else {
        setError('Failed to verify booking payment status.');
      }
    } catch (err) {
      console.error('Error verifying booking:', err);
      setError('A network error occurred while verifying details.');
    } finally {
      setLoading(false);
      setVerifying(false);
    }
  }, [bookingId]);

  useEffect(() => {
    let ignore = false;

    async function initializeBooking() {
      if (!bookingId) {
        if (!ignore) {
          setError('No booking ID provided.');
          setLoading(false);
        }
        return;
      }

      try {
        if (!ignore) setVerifying(true);
        const statusRes = await fetch(`/api/payments/status?bookingId=${bookingId}`);
        if (statusRes.ok) {
          const detailsRes = await fetch(`/api/bookings/details?id=${bookingId}`);
          const data = await detailsRes.json();
          if (!ignore) {
            if (detailsRes.ok) {
              setBooking(data.booking);
            } else {
              setError(data.error || 'Unable to load booking details.');
            }
          }
        } else if (!ignore) {
          setError('Failed to verify booking payment status.');
        }
      } catch (err) {
        console.error('Error verifying booking:', err);
        if (!ignore) {
          setError('A network error occurred while verifying details.');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
          setVerifying(false);
        }
      }
    }

    initializeBooking();

    return () => {
      ignore = true;
    };
  }, [bookingId]);

  const handleRetryPayment = async () => {
    if (!booking) return;
    setPayError(false);
    setLoading(true);

    try {
      const res = await fetch('/api/payments/paylio/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          bookingNumber: booking.bookingNumber,
        }),
      });

      const data = await res.json();
      if (res.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        setError(data.error || 'Unable to initiate payment retry.');
        setLoading(false);
      }
    } catch (err) {
      console.error('Retry payment error:', err);
      setError('An error occurred while retrying payment.');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 shadow-xs">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-slate-600 text-sm font-medium">Verifying appointment and payment status...</p>
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
  const isPaid = booking.paymentStatus === 'PAID';
  const isFailed = booking.paymentStatus === 'FAILED';

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 p-6 sm:p-10 shadow-xs space-y-8">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-xs ${
          isPaid
            ? 'bg-emerald-100 text-emerald-800'
            : isFailed
            ? 'bg-rose-100 text-rose-800'
            : 'bg-amber-100 text-amber-800'
        }`}>
          {isPaid ? (
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : isFailed ? (
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {isPaid
            ? 'Booking & Payment Confirmed!'
            : isFailed
            ? 'Payment Not Completed'
            : 'Appointment Created — Payment Pending'}
        </h1>
        <p className="text-slate-600 text-sm max-w-md mx-auto">
          {isPaid
            ? 'Your payment has been verified by PayLio and your massage appointment is confirmed.'
            : isFailed
            ? 'Payment was not completed or was declined by PayLio. You may retry payment below.'
            : 'Your appointment request is saved. We are awaiting payment settlement verification.'}
        </p>
      </div>

      {payError && (
        <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 text-rose-800 text-xs space-y-2">
          <p className="font-bold">PayLio Payment Session Error</p>
          <p>
            We created your booking, but could not open the PayLio checkout automatically. Please click the retry payment button below.
          </p>
        </div>
      )}

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
                booking.status === 'CONFIRMED' || booking.status === 'COMPLETED'
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}
            >
              Booking: {booking.status}
            </span>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${
                isPaid
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : isFailed
                  ? 'bg-rose-100 text-rose-900 border-rose-300'
                  : 'bg-amber-100 text-amber-900 border-amber-300'
              }`}
            >
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

      {/* Dynamic Payment Banner */}
      {!isPaid && (
        <div className={`p-5 rounded-2xl border text-xs space-y-3 ${
          isFailed
            ? 'bg-rose-50 border-rose-200 text-rose-900'
            : 'bg-amber-50 border-amber-200/80 text-amber-900'
        }`}>
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider">
              {isFailed ? 'Payment Status: Unpaid / Failed' : 'Payment Status: Pending Verification'}
            </span>
            <button
              type="button"
              onClick={loadBookingAndVerify}
              disabled={verifying}
              className="font-bold underline hover:opacity-80 cursor-pointer disabled:opacity-50"
            >
              {verifying ? 'Checking...' : 'Refresh Status'}
            </button>
          </div>
          <p className="leading-relaxed">
            {isFailed
              ? 'Payment was not confirmed. Click below to retry payment with PayLio.'
              : 'If you completed payment on PayLio, verification occurs automatically in seconds. Click refresh to update status.'}
          </p>
          <div className="pt-2 flex justify-start">
            <button
              type="button"
              onClick={handleRetryPayment}
              className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Pay Now with PayLio →
            </button>
          </div>
        </div>
      )}

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
            onSuccess={loadBookingAndVerify}
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
