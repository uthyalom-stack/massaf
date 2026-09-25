'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getTestDataPreviewAction, deleteTestDataAction } from '@/app/admin/actions';

interface TestDataPreviewCounts {
  customersCount: number;
  therapistsCount: number;
  bookingsCount: number;
  giftCardsCount: number;
  reviewsCount: number;
  notificationsCount: number;
  marketingLinksCount: number;
  testimonialsCount: number;
  totalTestRecords: number;
}

export function TestDataCleanupSection() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [preview, setPreview] = useState<TestDataPreviewCounts | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  const handleFetchPreview = () => {
    setActionError(null);
    setActionMessage(null);

    startTransition(async () => {
      const res = await getTestDataPreviewAction();
      if (res.success && res.preview) {
        setPreview(res.preview);
      } else {
        setActionError(res.error || 'Failed to fetch test data preview.');
      }
    });
  };

  const handleDeleteExecute = () => {
    if (confirmInput !== 'DELETE TEST DATA') {
      setActionError('Confirmation phrase mismatch.');
      return;
    }

    setActionError(null);
    setActionMessage(null);

    startTransition(async () => {
      const res = await deleteTestDataAction({ confirmPhrase: confirmInput });
      if (res.success) {
        setActionMessage(res.message || 'Test data cleanup executed successfully.');
        setIsModalOpen(false);
        setConfirmInput('');
        setPreview(null);
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to execute test data cleanup.');
      }
    });
  };

  return (
    <div className="bg-rose-50/50 rounded-3xl border border-rose-200 p-6 sm:p-8 space-y-5 shadow-xs">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-rose-200 text-rose-900 text-[10px] font-black uppercase tracking-wider">
              Danger Zone
            </span>
            <h2 className="text-lg font-bold text-slate-900">
              Test Data Cleanup
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1 max-w-xl">
            Super Admin Utility — Remove test customer accounts, test therapists, test bookings, test payments, reviews, and test operational notifications while preserving real administrator accounts and system configuration.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isPending}
            onClick={handleFetchPreview}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {isPending ? 'Calculating...' : 'Preview Test Data'}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setIsModalOpen(true);
              setConfirmInput('');
            }}
            className="px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            Delete Test Data
          </button>
        </div>
      </div>

      {/* Banners */}
      {actionMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-100 border border-rose-300 text-rose-900 text-xs font-medium">
          {actionError}
        </div>
      )}

      {/* Preview Breakdown Card */}
      {preview && (
        <div className="bg-white rounded-2xl border border-rose-200 p-4 text-xs space-y-3">
          <div className="flex items-center justify-between font-bold text-slate-900 border-b border-slate-100 pb-2">
            <span>Test Data Breakdown Summary</span>
            <span className="text-rose-700">{preview.totalTestRecords} Test Records Total</span>
          </div>

          {preview.totalTestRecords === 0 ? (
            <p className="text-slate-500 italic p-2 text-center">No test data records found in database.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Test Customers</span>
                <span className="font-extrabold text-slate-900 text-sm">{preview.customersCount}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Test Therapists</span>
                <span className="font-extrabold text-slate-900 text-sm">{preview.therapistsCount}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Test Bookings</span>
                <span className="font-extrabold text-slate-900 text-sm">{preview.bookingsCount}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Gift Cards / Reviews</span>
                <span className="font-extrabold text-slate-900 text-sm">{preview.giftCardsCount + preview.reviewsCount}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-rose-200">
            <h3 className="text-lg font-extrabold text-rose-900 border-b border-rose-100 pb-2">
              Confirm Test Data Deletion
            </h3>

            <p className="text-xs text-slate-600 leading-relaxed">
              This action is <strong className="text-rose-700">destructive and permanent</strong>. All identified test customer accounts, test therapists, test bookings, proof images, reviews, and notifications will be permanently deleted from the database.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Type <span className="font-mono font-black text-rose-700">DELETE TEST DATA</span> to confirm
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="DELETE TEST DATA"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-rose-600 bg-slate-50/50"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setConfirmInput('');
                }}
                className="px-4 py-2 font-semibold text-xs rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || confirmInput !== 'DELETE TEST DATA'}
                onClick={handleDeleteExecute}
                className="px-5 py-2 font-bold text-xs rounded-xl bg-rose-700 text-white hover:bg-rose-800 disabled:opacity-40 cursor-pointer"
              >
                {isPending ? 'Deleting...' : 'Permanently Delete Test Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
