'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  approveGiftCardPaymentAction,
  rejectGiftCardPaymentAction,
  requestRefundAction,
  processRefundAction,
} from '@/app/admin/actions';

export interface GiftCardSubmissionData {
  id: string;
  cardType: string;
  cardCode: string;
  declaredValue: number;
  notes: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  imageIds: string[];
}

export interface RefundRecordData {
  id: string;
  amount: number;
  reason: string | null;
  status: string; // REQUESTED, APPROVED, PROCESSED, FAILED
  requestedBy: string;
  processedBy: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentItem {
  id: string; // bookingId
  bookingNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  serviceName: string;
  therapistName: string;
  amount: number;
  paymentStatus: 'PAID' | 'PENDING' | 'UNPAID' | 'FAILED' | 'REFUNDED';
  paymentMethod: string;
  paymentReference: string | null;
  bookingStatus: string;
  createdAt: string;
  giftCardSubmission?: GiftCardSubmissionData | null;
  refunds?: RefundRecordData[];
}

interface PaymentReviewClientProps {
  initialPayments: PaymentItem[];
  currentStatus?: string;
  currentSearch?: string;
}

export function PaymentReviewClient({
  initialPayments,
  currentStatus = 'ALL',
  currentSearch = '',
}: PaymentReviewClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(currentSearch);
  const [statusFilter, setStatusFilter] = useState(currentStatus);

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [selectedPayment, setSelectedPayment] = useState<PaymentItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const [refundReason, setRefundReason] = useState('');
  const [isRequestingRefund, setIsRequestingRefund] = useState(false);

  const applyFilters = (newSearch: string, newStatus: string) => {
    const params = new URLSearchParams();
    if (newSearch.trim()) params.set('search', newSearch.trim());
    if (newStatus && newStatus !== 'ALL') params.set('status', newStatus);

    startTransition(() => {
      router.push(`/admin/payments${params.toString() ? `?${params.toString()}` : ''}`);
    });
  };

  const handleApproveGC = (bookingId: string) => {
    setActionMessage(null);
    setActionError(null);

    startTransition(async () => {
      const res = await approveGiftCardPaymentAction(bookingId);
      if (res.success) {
        setActionMessage(res.message || 'Payment approved successfully.');
        setSelectedPayment(null);
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to approve payment.');
      }
    });
  };

  const handleRejectGC = (bookingId: string) => {
    setActionMessage(null);
    setActionError(null);

    startTransition(async () => {
      const res = await rejectGiftCardPaymentAction(bookingId, rejectReason);
      if (res.success) {
        setActionMessage(res.message || 'Payment rejected successfully.');
        setSelectedPayment(null);
        setIsRejecting(false);
        setRejectReason('');
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to reject payment.');
      }
    });
  };

  const handleRequestRefund = (bookingId: string) => {
    setActionMessage(null);
    setActionError(null);

    startTransition(async () => {
      const res = await requestRefundAction({
        bookingId,
        reason: refundReason.trim() || undefined,
      });

      if (res.success) {
        setActionMessage('Refund request recorded successfully!');
        setIsRequestingRefund(false);
        setRefundReason('');
        setSelectedPayment(null);
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to request refund.');
      }
    });
  };

  const handleProcessRefund = (refundId: string, status: 'APPROVED' | 'PROCESSED' | 'FAILED') => {
    setActionMessage(null);
    setActionError(null);

    startTransition(async () => {
      const res = await processRefundAction({
        refundId,
        status,
      });

      if (res.success) {
        setActionMessage(`Refund record updated to ${status}.`);
        setSelectedPayment(null);
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to process refund.');
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
              Search Transactions
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search booking #, customer name, email, or reference..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent bg-slate-50/50"
            />
          </div>

          <div className="sm:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Payment Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                applyFilters(search, e.target.value);
              }}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent bg-slate-50/50"
            >
              <option value="ALL">All Payment Statuses</option>
              <option value="PAID">Paid</option>
              <option value="PENDING">Pending</option>
              <option value="UNPAID">Unpaid</option>
              <option value="FAILED">Failed</option>
              <option value="REFUNDED">Refunded</option>
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

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase tracking-wider text-[11px]">
              <th className="p-4">Booking #</th>
              <th className="p-4">Customer</th>
              <th className="p-4">Method & Ref</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Payment Status</th>
              <th className="p-4">Date</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialPayments.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                  No payment records found.
                </td>
              </tr>
            ) : (
              initialPayments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-4 font-mono font-bold text-emerald-700">
                    <Link href={`/admin/bookings/${p.id}`} className="hover:underline">
                      #{p.bookingNumber}
                    </Link>
                  </td>
                  <td className="p-4">
                    <Link href={`/admin/customers/${p.customerId}`} className="font-bold text-slate-900 hover:underline block">
                      {p.customerName}
                    </Link>
                    <div className="text-slate-400 text-xs">{p.customerEmail}</div>
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-slate-800 uppercase">{p.paymentMethod}</div>
                    <div className="text-slate-500 text-xs font-mono">{p.paymentReference || 'No ref'}</div>
                  </td>
                  <td className="p-4 font-black text-slate-900">
                    ${p.amount.toFixed(2)}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        p.paymentStatus === 'PAID'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : p.paymentStatus === 'PENDING'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : p.paymentStatus === 'REFUNDED'
                          ? 'bg-purple-100 text-purple-900 border border-purple-300'
                          : 'bg-rose-100 text-rose-900 border border-rose-300'
                      }`}
                    >
                      {p.paymentStatus}
                    </span>
                  </td>
                  <td className="p-4 text-slate-500">
                    {new Date(p.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedPayment(p)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs transition-colors cursor-pointer"
                    >
                      Inspect / Manage
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Payment & Refund Detail Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 border border-slate-200 max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Payment Details — #{selectedPayment.bookingNumber}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setSelectedPayment(null);
                  setIsRejecting(false);
                  setIsRequestingRefund(false);
                }}
                className="text-slate-400 hover:text-slate-600 text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl">
              <div>
                <span className="text-slate-400 uppercase font-bold text-[10px] block">Customer</span>
                <span className="font-bold text-slate-900">{selectedPayment.customerName}</span>
                <span className="text-slate-500 block">{selectedPayment.customerEmail}</span>
              </div>
              <div>
                <span className="text-slate-400 uppercase font-bold text-[10px] block">Amount & Method</span>
                <span className="font-bold text-slate-900 text-sm">${selectedPayment.amount.toFixed(2)} USD</span>
                <span className="text-slate-600 font-semibold block uppercase">{selectedPayment.paymentMethod} ({selectedPayment.paymentStatus})</span>
              </div>
            </div>

            {/* Gift Card Review Section (if present) */}
            {selectedPayment.giftCardSubmission && (
              <div className="space-y-3 p-4 bg-amber-50/50 border border-amber-200 rounded-xl">
                <div className="flex items-center justify-between font-bold text-amber-900">
                  <span>Gift Card Submission: {selectedPayment.giftCardSubmission.cardType}</span>
                  <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 uppercase text-[10px]">
                    {selectedPayment.giftCardSubmission.status}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Declared Value: ${selectedPayment.giftCardSubmission.declaredValue}</span>
                  <span className="text-slate-900 font-mono font-bold">Code: {selectedPayment.giftCardSubmission.cardCode}</span>
                </div>

                {selectedPayment.giftCardSubmission.imageIds && selectedPayment.giftCardSubmission.imageIds.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    {selectedPayment.giftCardSubmission.imageIds.map((imgId) => (
                      <div key={imgId} className="border border-amber-300 rounded-lg overflow-hidden bg-white p-1">
                        <img
                          src={`/api/admin/gift-cards/image?imageId=${encodeURIComponent(imgId)}`}
                          alt="Proof"
                          className="w-full h-32 object-contain"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {selectedPayment.giftCardSubmission.status === 'PENDING' && (
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleApproveGC(selectedPayment.id)}
                      className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg font-bold hover:bg-emerald-800"
                    >
                      Approve Gift Card
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleRejectGC(selectedPayment.id)}
                      className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg font-bold hover:bg-rose-100"
                    >
                      Reject Gift Card
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Refunds Section */}
            <div className="space-y-3">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] border-b border-slate-100 pb-2">
                Refund History & Actions
              </h4>

              {selectedPayment.refunds && selectedPayment.refunds.length > 0 ? (
                <div className="space-y-2">
                  {selectedPayment.refunds.map((ref) => (
                    <div key={ref.id} className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl space-y-1">
                      <div className="flex items-center justify-between font-bold text-purple-950">
                        <span>Refund Record (${ref.amount.toFixed(2)})</span>
                        <span className="px-2 py-0.5 rounded bg-purple-200 text-purple-900 uppercase text-[10px]">
                          {ref.status}
                        </span>
                      </div>
                      <div className="text-slate-600">Requested by: {ref.requestedBy}</div>
                      {ref.reason && <div className="text-slate-700 italic">"{ref.reason}"</div>}

                      {ref.status === 'REQUESTED' || ref.status === 'APPROVED' ? (
                        <div className="flex items-center gap-2 pt-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleProcessRefund(ref.id, 'PROCESSED')}
                            className="px-3 py-1 bg-emerald-700 text-white rounded-lg font-bold hover:bg-emerald-800"
                          >
                            Mark Refund Processed ✓
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleProcessRefund(ref.id, 'FAILED')}
                            className="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg font-bold hover:bg-rose-100"
                          >
                            Mark Refund Failed ✕
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic">No refund records for this payment.</p>
              )}

              {selectedPayment.paymentStatus === 'PAID' && !isRequestingRefund && (
                <button
                  type="button"
                  onClick={() => setIsRequestingRefund(true)}
                  className="px-4 py-2 bg-purple-50 text-purple-800 border border-purple-200 rounded-xl font-bold hover:bg-purple-100 cursor-pointer"
                >
                  + Initiate Refund Request
                </button>
              )}

              {isRequestingRefund && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-3">
                  <h5 className="font-bold text-purple-900">Request Refund for #{selectedPayment.bookingNumber}</h5>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">Reason for Refund</label>
                    <input
                      type="text"
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="e.g. Customer requested cancellation before appointment"
                      className="w-full p-2 bg-white border border-purple-300 rounded-lg"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRequestingRefund(false)}
                      className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleRequestRefund(selectedPayment.id)}
                      className="px-4 py-1.5 bg-purple-700 text-white rounded-lg font-bold hover:bg-purple-800"
                    >
                      Confirm Refund Request
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
