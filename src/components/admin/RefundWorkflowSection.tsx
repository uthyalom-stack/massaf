'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { requestRefundAction, processRefundAction } from '@/app/admin/actions';

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

interface RefundWorkflowSectionProps {
  bookingId: string;
  bookingAmount: number;
  paymentStatus: string;
  refunds: RefundRecordData[];
}

export function RefundWorkflowSection({
  bookingId,
  bookingAmount,
  paymentStatus,
  refunds,
}: RefundWorkflowSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [isRequesting, setIsRequesting] = useState(false);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState<number>(bookingAmount);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRequestRefund = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await requestRefundAction({
        bookingId,
        amount,
        reason: reason.trim() || undefined,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to request refund.');
      } else {
        setSuccessMsg('Refund request created successfully!');
        setIsRequesting(false);
        setReason('');
        router.refresh();
      }
    });
  };

  const handleProcessRefund = (refundId: string, status: 'APPROVED' | 'PROCESSED' | 'FAILED') => {
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await processRefundAction({
        refundId,
        status,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to process refund.');
      } else {
        setSuccessMsg(`Refund record status updated to ${status}.`);
        router.refresh();
      }
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Refund Management Workflow
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Truthfully track refund request, approval, and execution states.
          </p>
        </div>

        {paymentStatus === 'PAID' && !isRequesting && (
          <button
            type="button"
            onClick={() => setIsRequesting(true)}
            className="px-3.5 py-1.5 rounded-xl bg-purple-700 text-white font-bold text-xs hover:bg-purple-800 transition-colors cursor-pointer"
          >
            + Request Refund
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
          ✕ {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
          ✓ {successMsg}
        </div>
      )}

      {/* Refund Request Form */}
      {isRequesting && (
        <form onSubmit={handleRequestRefund} className="p-4 bg-purple-50/50 border border-purple-200 rounded-xl space-y-3 text-xs">
          <h3 className="font-bold text-purple-900">Initiate Refund Request</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="refund-amount" className="block text-slate-700 font-semibold mb-1">Refund Amount ($)</label>
              <input
                id="refund-amount"
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                required
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold"
              />
            </div>

            <div>
              <label htmlFor="refund-reason" className="block text-slate-700 font-semibold mb-1">Reason for Refund</label>
              <input
                id="refund-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Customer requested cancellation"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsRequesting(false)}
              className="px-3.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold disabled:opacity-50"
            >
              {isPending ? 'Submitting...' : 'Submit Refund Request'}
            </button>
          </div>
        </form>
      )}

      {/* Existing Refunds List */}
      <div className="space-y-3">
        {refunds.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No refund requests recorded for this booking.</p>
        ) : (
          refunds.map((ref) => (
            <div key={ref.id} className="p-4 bg-purple-50/60 border border-purple-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-purple-950">
                <span>Refund Amount: ${ref.amount.toFixed(2)}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-black ${
                  ref.status === 'PROCESSED'
                    ? 'bg-purple-200 text-purple-900'
                    : ref.status === 'FAILED'
                    ? 'bg-rose-200 text-rose-900'
                    : 'bg-amber-200 text-amber-900'
                }`}>
                  {ref.status}
                </span>
              </div>

              <div className="text-slate-600">
                Requested by: <strong>{ref.requestedBy}</strong>
                {ref.processedBy ? ` • Processed by: ${ref.processedBy}` : ''}
              </div>

              {ref.reason && <p className="text-slate-700 italic">"{ref.reason}"</p>}

              {(ref.status === 'REQUESTED' || ref.status === 'APPROVED') && (
                <div className="flex items-center gap-2 pt-2 border-t border-purple-200/60">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleProcessRefund(ref.id, 'PROCESSED')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold transition-colors cursor-pointer"
                  >
                    Mark Refund Processed ✓
                  </button>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleProcessRefund(ref.id, 'FAILED')}
                    className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 font-bold transition-colors cursor-pointer"
                  >
                    Mark Refund Failed ✕
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
