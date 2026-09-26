'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookingStatus, PaymentStatus, ServiceLocationType } from '@prisma/client';
import {
  updateBookingStatusAction,
  assignBookingTherapistAction,
  cancelBookingAction,
  approveGiftCardPaymentAction,
  rejectGiftCardPaymentAction,
} from '@/app/admin/actions';
import { BookingRescheduleSection } from '@/components/admin/BookingRescheduleSection';
import { FindCompatibleTherapistsSection } from '@/components/admin/FindCompatibleTherapistsSection';
import { BookingTimelineSection, TimelineAuditLog, TimelineRefund } from '@/components/admin/BookingTimelineSection';
import { AdminNotesSection, SerializedAdminNote } from '@/components/admin/AdminNotesSection';
import { RefundWorkflowSection, RefundRecordData } from '@/components/admin/RefundWorkflowSection';

export interface GiftCardSubmissionData {
  id: string;
  cardType: string;
  cardCode: string;
  declaredValue: number;
  notes: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  imageIds?: string[];
}

export interface BookingDetailCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface BookingDetailTherapistOption {
  id: string;
  name: string;
  isActive: boolean;
  offersStudio: boolean;
  offersInHome: boolean;
}

export interface BookingDetailData {
  id: string;
  bookingNumber: string;
  createdAt: string;
  updatedAt: string;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  paymentReference: string | null;
  amount: number;
  appointmentDateTime: string;
  durationMinutes: number;
  locationType: ServiceLocationType;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  notes: string | null;
  reminder24hSentAt?: string | null;
  reminder3hSentAt?: string | null;
  customer: BookingDetailCustomer;
  therapistId: string | null;
  therapistName: string;
  serviceId: string;
  serviceName: string;
  serviceDescription: string | null;
  servicePrice: number;
  giftCardSubmission?: GiftCardSubmissionData | null;
  auditLogs?: TimelineAuditLog[];
  internalNotes?: SerializedAdminNote[];
  refunds?: RefundRecordData[];
}

interface BookingDetailClientProps {
  booking: BookingDetailData;
  availableTherapists: BookingDetailTherapistOption[];
}

export default function BookingDetailClient({
  booking,
  availableTherapists,
}: BookingDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedTherapistId, setSelectedTherapistId] = useState<string>(
    booking.therapistId || ''
  );
  const [selectedStatus, setSelectedStatus] = useState<BookingStatus>(booking.status);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const clearMessages = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleAssignTherapist = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (!selectedTherapistId) {
      setErrorMsg('Please select a therapist from the list.');
      return;
    }

    startTransition(async () => {
      const res = await assignBookingTherapistAction({
        bookingId: booking.id,
        therapistId: selectedTherapistId,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'This therapist cannot be assigned to this booking.');
      } else {
        setSuccessMsg('Therapist assignment updated successfully.');
        router.refresh();
      }
    });
  };

  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (selectedStatus === booking.status) return;

    startTransition(async () => {
      const res = await updateBookingStatusAction({
        bookingId: booking.id,
        status: selectedStatus,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'This booking cannot be moved to that status.');
      } else {
        setSuccessMsg(`Booking status updated to ${selectedStatus.replace('_', ' ')}.`);
        router.refresh();
      }
    });
  };

  const handleCancelBooking = async () => {
    clearMessages();
    setIsCancelModalOpen(false);

    startTransition(async () => {
      const res = await cancelBookingAction({
        bookingId: booking.id,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Unable to cancel booking.');
      } else {
        setSuccessMsg('Booking cancelled successfully.');
        setSelectedStatus('CANCELLED');
        router.refresh();
      }
    });
  };

  const getStatusBadge = (bStatus: BookingStatus) => {
    switch (bStatus) {
      case 'PENDING':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">Pending</span>;
      case 'CONFIRMED':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">Confirmed</span>;
      case 'ASSIGNED':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">Assigned</span>;
      case 'IN_PROGRESS':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-200">In Progress</span>;
      case 'COMPLETED':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">Completed</span>;
      case 'CANCELLED':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-200">Cancelled</span>;
      case 'REFUNDED':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-800 border border-slate-200">Refunded</span>;
      case 'NO_SHOW':
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-orange-100 text-orange-800 border border-orange-200">No Show</span>;
      default:
        return <span className="px-3 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-800">{bStatus}</span>;
    }
  };

  const getPaymentBadge = (pStatus: PaymentStatus) => {
    switch (pStatus) {
      case 'PAID':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Paid</span>;
      case 'PENDING':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-50 text-amber-700 border border-amber-200">Payment Pending</span>;
      case 'UNPAID':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 text-slate-600 border border-slate-200">Unpaid</span>;
      case 'FAILED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded bg-rose-50 text-rose-700 border border-rose-200">Failed</span>;
      case 'REFUNDED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded bg-gray-100 text-gray-600 border border-gray-200">Refunded</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-100 text-slate-600">{pStatus}</span>;
    }
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  const isCancellable = !['CANCELLED', 'COMPLETED', 'REFUNDED'].includes(booking.status);
  const isUnassigned = !booking.therapistId;

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/bookings"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors mb-2"
          >
            &larr; Back to Bookings List
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-mono">
              {booking.bookingNumber}
            </h1>
            {getStatusBadge(booking.status)}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Created on {formatDate(booking.createdAt)} at {formatTime(booking.createdAt)}
          </p>
        </div>

        {isCancellable && (
          <div>
            <button
              type="button"
              onClick={() => setIsCancelModalOpen(true)}
              disabled={isPending}
              className="px-4 py-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80 font-bold text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
            >
              Cancel Booking
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-600 hover:text-rose-900 font-bold ml-4">
            &times;
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between">
          <span>{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-900 font-bold ml-4">
            &times;
          </button>
        </div>
      )}

      {/* PHASE 2: RESCHEDULE SECTION */}
      <BookingRescheduleSection
        bookingId={booking.id}
        currentDateTimeISO={booking.appointmentDateTime}
        therapistId={booking.therapistId}
        availableTherapists={availableTherapists}
        isCancellable={isCancellable}
      />

      {/* PHASE 3: FIND COMPATIBLE THERAPISTS (UNASSIGNED MATCHING) */}
      <FindCompatibleTherapistsSection
        bookingId={booking.id}
        isUnassigned={isUnassigned}
        isCancellable={isCancellable}
      />

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Appointment Info Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
              Appointment Details
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block font-semibold">Service</span>
                <span className="text-slate-900 font-extrabold text-sm block mt-0.5">{booking.serviceName}</span>
                {booking.serviceDescription && (
                  <p className="text-slate-500 text-[11px] mt-1 leading-relaxed">{booking.serviceDescription}</p>
                )}
              </div>

              <div>
                <span className="text-slate-500 block font-semibold">Date & Time</span>
                <span className="text-slate-900 font-extrabold text-sm block mt-0.5">
                  {formatDate(booking.appointmentDateTime)}
                </span>
                <span className="text-slate-600 font-medium block">
                  {formatTime(booking.appointmentDateTime)} ({booking.durationMinutes} Minutes)
                </span>
              </div>

              <div>
                <span className="text-slate-500 block font-semibold">Location Type</span>
                <span className="text-slate-900 font-bold block mt-0.5">
                  {booking.locationType === 'IN_HOME' ? 'In-Home Visit' : 'Therapist Studio'}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block font-semibold">Assigned Therapist</span>
                {booking.therapistId ? (
                  <span className="text-slate-900 font-bold block mt-0.5">{booking.therapistName}</span>
                ) : (
                  <span className="text-amber-700 font-extrabold italic bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 inline-block mt-0.5">
                    Unassigned
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Location & Address */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
              Fulfillment Location
            </h2>

            {booking.locationType === 'IN_HOME' ? (
              <div className="text-xs space-y-1 text-slate-800 font-medium">
                <div className="text-slate-500 font-semibold mb-1">Customer Address (In-Home)</div>
                <div>{booking.addressLine1 || 'N/A'}</div>
                {booking.addressLine2 && <div>{booking.addressLine2}</div>}
                <div>
                  {booking.city ? `${booking.city}, ` : ''}{booking.state || ''} {booking.zipCode || ''}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-700">
                <div className="text-slate-500 font-semibold mb-1">Studio Appointment</div>
                <p>Client will visit the therapist studio location upon confirmation.</p>
              </div>
            )}
          </div>

          {/* Customer Info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
              Customer Information
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-500 block font-semibold">Name</span>
                <Link href={`/admin/customers/${booking.customer.id}`} className="text-slate-900 font-bold block mt-0.5 hover:underline">
                  {booking.customer.name}
                </Link>
              </div>

              <div>
                <span className="text-slate-500 block font-semibold">Email</span>
                <span className="text-slate-900 font-medium block mt-0.5">{booking.customer.email}</span>
              </div>

              <div>
                <span className="text-slate-500 block font-semibold">Phone</span>
                <span className="text-slate-900 font-medium block mt-0.5">{booking.customer.phone}</span>
              </div>
            </div>
          </div>

          {/* PHASE 10: REFUND WORKFLOW */}
          <RefundWorkflowSection
            bookingId={booking.id}
            bookingAmount={booking.amount}
            paymentStatus={booking.paymentStatus}
            refunds={booking.refunds || []}
          />

          {/* PHASE 4: BOOKING TIMELINE */}
          <BookingTimelineSection
            bookingCreatedAt={booking.createdAt}
            customerEmail={booking.customer.email}
            reminder24hSentAt={booking.reminder24hSentAt || null}
            reminder3hSentAt={booking.reminder3hSentAt || null}
            auditLogs={booking.auditLogs || []}
            refunds={(booking.refunds || []) as TimelineRefund[]}
          />

          {/* PHASE 5: INTERNAL ADMIN NOTES */}
          <AdminNotesSection
            entityType="BOOKING"
            entityId={booking.id}
            notes={booking.internalNotes || []}
          />
        </div>

        {/* Right 1 Column */}
        <div className="space-y-6">
          {/* Status Control Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
              Update Status
            </h2>

            <form onSubmit={handleStatusUpdate} className="space-y-3">
              <div>
                <label htmlFor="status-select" className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Status: <span className="font-bold text-slate-900">{booking.status}</span>
                </label>
                <select
                  id="status-select"
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as BookingStatus)}
                  disabled={isPending || !isCancellable}
                  className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 text-slate-900 disabled:opacity-60"
                >
                  {Object.values(BookingStatus).map((st) => (
                    <option key={st} value={st}>
                      {st.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isPending || selectedStatus === booking.status || !isCancellable}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
              >
                {isPending ? 'Updating...' : 'Save Status Change'}
              </button>
            </form>
          </div>

          {/* Therapist Assignment Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
              Assign / Reassign Therapist
            </h2>

            <form onSubmit={handleAssignTherapist} className="space-y-3">
              <div>
                <label htmlFor="therapist-select" className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Active Therapist
                </label>
                {availableTherapists.length === 0 ? (
                  <p className="text-xs text-amber-700 font-semibold bg-amber-50 p-2.5 rounded-xl border border-amber-200/80">
                    No active therapists available for assignment.
                  </p>
                ) : (
                  <select
                    id="therapist-select"
                    value={selectedTherapistId}
                    onChange={(e) => setSelectedTherapistId(e.target.value)}
                    disabled={isPending || !isCancellable}
                    className="w-full text-xs font-medium px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 text-slate-900 disabled:opacity-60"
                  >
                    <option value="">-- Choose Therapist --</option>
                    {availableTherapists.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {!t.isActive ? '(Inactive)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="submit"
                disabled={isPending || !selectedTherapistId || selectedTherapistId === booking.therapistId || !isCancellable}
                className="w-full px-4 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-700 cursor-pointer"
              >
                {isPending ? 'Assigning...' : 'Assign Therapist'}
              </button>
            </form>
          </div>

          {/* Payment Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
              Payment Summary
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Total Amount</span>
                <span className="text-slate-900 font-black text-lg">${booking.amount.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-semibold">Payment Status</span>
                <div>{getPaymentBadge(booking.paymentStatus)}</div>
              </div>

              {booking.paymentMethod && (
                <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                  <span className="text-slate-500 font-semibold">Payment Method</span>
                  <span className="text-slate-800 font-bold uppercase">{booking.paymentMethod}</span>
                </div>
              )}

              {booking.paymentReference && (
                <div className="border-t border-slate-100 pt-2">
                  <span className="text-slate-500 font-semibold block">Reference / Transaction ID</span>
                  <span className="text-slate-800 font-mono text-[11px] break-all block mt-0.5">
                    {booking.paymentReference}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Modal */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-5 shadow-xl">
            <h3 className="text-lg font-extrabold text-slate-900">Cancel Booking Confirmation</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to cancel booking <strong className="font-mono text-slate-900">{booking.bookingNumber}</strong>?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs"
              >
                Keep Active
              </button>
              <button
                type="button"
                onClick={handleCancelBooking}
                disabled={isPending}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
