'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { CustomerAuthModal } from '@/components/customer/CustomerAuthModal';
import { ReviewForm } from '@/components/customer/ReviewForm';

interface TimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
}

interface DetailedBooking {
  id: string;
  bookingNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  amount: number;
  hourlyRateUsed: number | null;
  calculatedTotal: number | null;
  appointmentDateTime: string;
  durationMinutes: number;
  locationType: 'STUDIO' | 'IN_HOME';
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  notes: string | null;
  createdAt: string;
  therapistName: string;
  serviceName: string;
  therapist: {
    id: string;
    name: string;
    profileImage: string | null;
    rating: number;
    reviewCount: number;
    offersStudio: boolean;
    offersInHome: boolean;
  } | null;
  service: {
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    price: number;
  } | null;
  canCancel: boolean;
  canReschedule: boolean;
  canReview: boolean;
  hasReview: boolean;
  existingReview: {
    id: string;
    rating: number;
    comment: string | null;
    status: string;
  } | null;
  timeline: TimelineEvent[];
}

export default function CustomerBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const bookingId = resolvedParams.id;
  const router = useRouter();

  const [booking, setBooking] = useState<DetailedBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Cancellation Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Reschedule Modal State
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('10:00');
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // Review Modal State
  const [showReviewModal, setShowReviewModal] = useState(false);

  const fetchBooking = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/bookings/details?id=${encodeURIComponent(bookingId)}`);

      if (res.status === 401) {
        setShowAuthModal(true);
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load booking details.');
        setLoading(false);
        return;
      }

      setBooking(data.booking);
      if (data.booking.appointmentDateTime) {
        setRescheduleDate(data.booking.appointmentDateTime.split('T')[0]);
      }
    } catch {
      setError('An error occurred while fetching booking details.');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    fetchBooking();
  }, [fetchBooking]);

  const handleCancelBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking) return;

    setCancelling(true);
    try {
      const res = await fetch('/api/account/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, reason: cancelReason }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to cancel booking.');
        setCancelling(false);
        return;
      }

      alert('Booking cancelled successfully.');
      setShowCancelModal(false);
      fetchBooking();
    } catch {
      alert('An error occurred while cancelling booking.');
    } finally {
      setCancelling(false);
    }
  };

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking || !rescheduleDate || !rescheduleTime) return;

    setRescheduling(true);
    setRescheduleError(null);

    try {
      const res = await fetch('/api/account/bookings/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          date: rescheduleDate,
          time: rescheduleTime,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRescheduleError(data.error || 'Failed to reschedule booking.');
        setRescheduling(false);
        return;
      }

      alert('Appointment rescheduled successfully!');
      setShowRescheduleModal(false);
      fetchBooking();
    } catch {
      setRescheduleError('An error occurred while rescheduling.');
    } finally {
      setRescheduling(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 animate-pulse space-y-6">
          <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg w-1/3"></div>
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-lg w-1/2"></div>
          <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (showAuthModal || (!booking && error?.includes('Unauthorized'))) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Customer Account Verification</h2>
          <p className="text-xs text-slate-500 mt-2">
            Please verify your customer email address to securely view this appointment.
          </p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="mt-6 w-full py-3 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
          >
            Verify Account
          </button>
        </div>
        <CustomerAuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onVerified={fetchBooking}
        />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="p-8 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-3xl text-rose-700 dark:text-rose-300">
          <h2 className="text-xl font-bold mb-2">Unable to Load Booking</h2>
          <p className="text-xs">{error || 'Booking details not found or access denied.'}</p>
          <Link
            href="/account"
            className="inline-block mt-4 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold"
          >
            Back to Account Portal
          </Link>
        </div>
      </div>
    );
  }

  const formattedDateTime = new Date(booking.appointmentDateTime).toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <Link href="/account" className="hover:text-emerald-600 dark:hover:text-emerald-400 font-semibold flex items-center gap-1">
          ← Back to My Account
        </Link>
        <span className="font-mono text-slate-400">Ref: {booking.bookingNumber}</span>
      </div>

      {/* Main Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Appointment Reservation
            </span>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              {booking.serviceName}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
              {booking.status}
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              Payment: {booking.paymentStatus}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          {booking.canReschedule && (
            <button
              onClick={() => setShowRescheduleModal(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 transition-colors"
            >
              📅 Reschedule Appointment
            </button>
          )}

          {booking.canCancel && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-600 dark:text-rose-400 transition-colors"
            >
              ✕ Cancel Booking
            </button>
          )}

          {booking.canReview && (
            <button
              onClick={() => setShowReviewModal(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-white transition-colors"
            >
              ★ Leave Review
            </button>
          )}
        </div>
      </div>

      {/* Grid Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Therapist Details */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
          <h2 className="text-sm font-extrabold uppercase text-slate-400 tracking-wider">Assigned Massage Therapist</h2>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-200 overflow-hidden shrink-0 relative">
              {booking.therapist?.profileImage ? (
                <Image src={booking.therapist.profileImage} alt={booking.therapistName} fill className="object-cover" />
              ) : (
                <div className="w-full h-full bg-emerald-600 flex items-center justify-center text-white font-black text-2xl">
                  {booking.therapistName[0] || 'M'}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{booking.therapistName}</h3>
              {booking.therapist && (
                <p className="text-xs text-slate-500 mt-0.5">
                  ★ {booking.therapist.rating.toFixed(1)} ({booking.therapist.reviewCount} reviews)
                </p>
              )}
              {booking.therapist?.id && (
                <Link
                  href={`/therapists/${booking.therapist.id}`}
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline mt-1 inline-block"
                >
                  View Profile →
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Appointment Time & Location */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
          <h2 className="text-sm font-extrabold uppercase text-slate-400 tracking-wider">Schedule & Location</h2>
          <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
            <p className="font-bold text-sm text-slate-900 dark:text-white">📅 {formattedDateTime}</p>
            <p>⏱ Duration: <strong>{booking.durationMinutes} Minutes</strong></p>
            <p>📍 Session Type: <strong>{booking.locationType === 'STUDIO' ? 'Therapist Studio' : 'In-Home Visit'}</strong></p>
            {booking.locationType === 'IN_HOME' && (
              <p className="text-slate-500">
                Address: {booking.addressLine1} {booking.addressLine2 ? `, ${booking.addressLine2}` : ''}, {booking.city}, {booking.state} {booking.zipCode}
              </p>
            )}
            {booking.notes && (
              <p className="text-slate-500 italic mt-2">Notes: {booking.notes}</p>
            )}
          </div>
        </div>

        {/* Pricing & Snapshot */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-4">
          <h2 className="text-sm font-extrabold uppercase text-slate-400 tracking-wider">Pricing Breakdown</h2>
          <div className="space-y-2 text-xs">
            {booking.hourlyRateUsed && (
              <div className="flex justify-between text-slate-500">
                <span>Therapist Rate Snapshot:</span>
                <span>${booking.hourlyRateUsed.toFixed(2)} / hr</span>
              </div>
            )}
            <div className="flex justify-between text-slate-500">
              <span>Duration Factor:</span>
              <span>{(booking.durationMinutes / 60).toFixed(2)} hrs</span>
            </div>
            <div className="flex justify-between font-bold text-slate-900 dark:text-white text-sm border-t border-slate-100 dark:border-slate-800 pt-2">
              <span>Total Amount:</span>
              <span className="text-emerald-600 dark:text-emerald-400">${booking.amount.toFixed(2)}</span>
            </div>
            {booking.paymentMethod && (
              <div className="text-[11px] text-slate-400 pt-1">
                Payment Method: {booking.paymentMethod} {booking.paymentReference ? `(Ref: ${booking.paymentReference})` : ''}
              </div>
            )}
          </div>
        </div>

        {/* Existing Review Card */}
        {booking.existingReview && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 space-y-2">
            <h2 className="text-sm font-extrabold uppercase text-slate-400 tracking-wider">Your Submitted Review</h2>
            <div className="flex items-center gap-1 text-amber-500 font-bold text-sm">
              {'★'.repeat(booking.existingReview.rating)} ({booking.existingReview.rating}/5)
            </div>
            {booking.existingReview.comment && (
              <p className="text-xs text-slate-600 dark:text-slate-300 italic">"{booking.existingReview.comment}"</p>
            )}
          </div>
        )}
      </div>

      {/* Customer Activity Timeline */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 space-y-4">
        <h2 className="text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
          Appointment Activity Timeline
        </h2>
        <p className="text-xs text-slate-500">Updates, scheduling events, and status changes for this reservation.</p>

        <div className="relative pl-6 border-l-2 border-emerald-500/30 space-y-6 pt-2">
          {booking.timeline.map((evt) => (
            <div key={evt.id} className="relative">
              <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-emerald-600 border-2 border-white dark:border-slate-900" />
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-slate-900 dark:text-white uppercase">{evt.title}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(evt.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400">{evt.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Confirm Cancellation</h3>
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-amber-800 dark:text-amber-300 text-xs rounded-2xl space-y-1">
              <p className="font-bold">Cancellation Policy Policy:</p>
              <p>Appointments cancelled in advance release the reserved time slot immediately. Refunds, if applicable, are processed according to our standard payment terms.</p>
            </div>
            <form onSubmit={handleCancelBooking} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Reason for Cancellation (Optional)</label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Tell us why you are cancelling..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Keep Appointment
                </button>
                <button
                  type="submit"
                  disabled={cancelling}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-500"
                >
                  {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Reschedule Appointment</h3>
            {rescheduleError && (
              <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl">{rescheduleError}</div>
            )}
            <form onSubmit={handleRescheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">New Date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">New Time</label>
                <input
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRescheduleModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rescheduling}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  {rescheduling ? 'Rescheduling...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Leave Review</h3>
              <button onClick={() => setShowReviewModal(false)} className="text-slate-400 text-sm">✕</button>
            </div>
            <ReviewForm
              bookingId={booking.id}
              therapistName={booking.therapistName}
              onSuccess={() => {
                setShowReviewModal(false);
                fetchBooking();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
