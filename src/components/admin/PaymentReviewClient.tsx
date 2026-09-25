'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { approveGiftCardPaymentAction, rejectGiftCardPaymentAction } from '@/app/admin/actions';

export interface GiftCardSubmissionItem {
  id: string;
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceName: string;
  therapistName: string;
  amount: number;
  paymentMethod: string;
  cardType: string;
  declaredValue: number;
  notes: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
  images: Array<{ id: string; storageKey: string }>;
}

interface PaymentReviewClientProps {
  initialSubmissions: GiftCardSubmissionItem[];
  currentStatus?: string;
  currentSearch?: string;
}

export function PaymentReviewClient({
  initialSubmissions,
  currentStatus = 'ALL',
  currentSearch = '',
}: PaymentReviewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(currentSearch);
  const [statusFilter, setStatusFilter] = useState(currentStatus);

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [selectedSubmission, setSelectedSubmission] = useState<GiftCardSubmissionItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const applyFilters = (newSearch: string, newStatus: string) => {
    const params = new URLSearchParams();
    if (newSearch.trim()) params.set('search', newSearch.trim());
    if (newStatus && newStatus !== 'ALL') params.set('status', newStatus);

    startTransition(() => {
      router.push(`/admin/payments${params.toString() ? `?${params.toString()}` : ''}`);
    });
  };

  const handleApprove = (bookingId: string) => {
    setActionMessage(null);
    setActionError(null);

    startTransition(async () => {
      const res = await approveGiftCardPaymentAction(bookingId);
      if (res.success) {
        setActionMessage(res.message || 'Payment approved successfully.');
        setSelectedSubmission(null);
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to approve payment.');
      }
    });
  };

  const handleReject = (bookingId: string) => {
    setActionMessage(null);
    setActionError(null);

    startTransition(async () => {
      const res = await rejectGiftCardPaymentAction(bookingId, rejectReason);
      if (res.success) {
        setActionMessage(res.message || 'Payment rejected successfully.');
        setSelectedSubmission(null);
        setIsRejecting(false);
        setRejectReason('');
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to reject payment.');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters(search, statusFilter);
          }}
          className="grid grid-cols-1 sm:grid-cols-12 gap-4"
        >
          <div className="sm:col-span-7">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Search Payments
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search booking #, customer name, email..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent bg-slate-50/50"
            />
          </div>

          <div className="sm:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Status Queue
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                applyFilters(search, e.target.value);
              }}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent bg-slate-50/50"
            >
              <option value="ALL">All Submissions</option>
              <option value="PENDING">Pending Review</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </form>
      </div>

      {/* Banners */}
      {actionMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
          {actionError}
        </div>
      )}

      {/* Submissions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-[11px]">
              <th className="p-4">Booking #</th>
              <th className="p-4">Customer</th>
              <th className="p-4">Service</th>
              <th className="p-4">Card Type & Value</th>
              <th className="p-4">Submitted</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialSubmissions.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                  No gift card payment submissions found in this queue.
                </td>
              </tr>
            ) : (
              initialSubmissions.map((sub) => (
                <tr key={sub.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4 font-mono font-bold text-emerald-700">
                    <Link href={`/admin/bookings/${sub.bookingId}`} className="hover:underline">
                      #{sub.bookingNumber}
                    </Link>
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-slate-900">{sub.customerName}</div>
                    <div className="text-slate-400 text-xs">{sub.customerEmail}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-semibold text-slate-800">{sub.serviceName}</div>
                    <div className="text-slate-400 text-xs">Total: ${sub.amount}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-slate-900">${sub.declaredValue}</div>
                    <div className="text-slate-500 text-xs">{sub.cardType}</div>
                  </td>
                  <td className="p-4 text-slate-500">
                    {new Date(sub.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        sub.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : sub.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {sub.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedSubmission(sub)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors cursor-pointer"
                    >
                      Inspect Proof
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Submission Proof & Approval Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                Gift Card Payment Review — #{selectedSubmission.bookingNumber}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedSubmission(null);
                  setIsRejecting(false);
                }}
                className="text-slate-400 hover:text-slate-600 text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl">
              <div>
                <span className="text-slate-400 uppercase font-bold text-[10px] block">Customer</span>
                <span className="font-bold text-slate-900 text-sm">{selectedSubmission.customerName}</span>
                <span className="text-slate-500 block">{selectedSubmission.customerEmail}</span>
              </div>
              <div>
                <span className="text-slate-400 uppercase font-bold text-[10px] block">Gift Card Details</span>
                <span className="font-bold text-slate-900 text-sm">${selectedSubmission.declaredValue} ({selectedSubmission.cardType})</span>
                <span className="text-slate-500 block">Booking Amount: ${selectedSubmission.amount}</span>
              </div>
            </div>

            {selectedSubmission.notes && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <strong>Customer Notes:</strong> {selectedSubmission.notes}
              </div>
            )}

            {/* Proof Photos Grid */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase text-slate-700 tracking-wider">Uploaded Card Proof Images ({selectedSubmission.images.length})</h4>
              {selectedSubmission.images.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No proof photos uploaded.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {selectedSubmission.images.map((img) => (
                    <div key={img.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-100 p-1">
                      {/* Secure image fetch endpoint */}
                      <img
                        src={`/api/admin/gift-cards/image?key=${encodeURIComponent(img.storageKey)}`}
                        alt="Gift Card Proof"
                        className="w-full h-40 object-contain rounded-lg"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedSubmission.reviewedBy && (
              <div className="text-xs text-slate-400 italic">
                Reviewed by {selectedSubmission.reviewedBy} on {selectedSubmission.reviewedAt}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              {!isRejecting ? (
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsRejecting(true)}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 cursor-pointer"
                  >
                    Reject Submission
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleApprove(selectedSubmission.bookingId)}
                    className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                  >
                    {isPending ? 'Processing...' : 'Approve & Confirm Booking'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3 bg-rose-50/50 p-4 rounded-xl border border-rose-200">
                  <label className="block text-xs font-bold text-rose-900">
                    Rejection Reason <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. Invalid PIN code or unreadable photo"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-600 bg-white"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRejecting(false)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleReject(selectedSubmission.bookingId)}
                      className="px-4 py-1.5 text-xs font-bold rounded-lg bg-rose-700 text-white hover:bg-rose-800 disabled:opacity-50 cursor-pointer"
                    >
                      {isPending ? 'Rejecting...' : 'Confirm Rejection'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
