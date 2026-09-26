'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getDevelopmentDataListAction,
  previewDevelopmentDataCleanupAction,
  executeDevelopmentDataCleanupAction,
} from '@/app/admin/actions';

interface CleanupDataList {
  therapists: Array<{ id: string; name: string; email?: string | null; phone?: string | null }>;
  customers: Array<{ id: string; name: string; email: string; phone: string }>;
  bookings: Array<{
    id: string;
    bookingNumber: string;
    appointmentDateTime: string;
    status: string;
    customerName: string;
    therapistName: string;
  }>;
  reviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    authorName: string;
    therapistName: string;
  }>;
  testimonials: Array<{ id: string; authorName: string; comment: string }>;
  adminNotifications: Array<{ id: string; title: string; message: string; createdAt: string }>;
}

interface PreviewCounts {
  selectedCounts: {
    therapists: number;
    customers: number;
    bookings: number;
    reviews: number;
    testimonials: number;
    notifications: number;
  };
  dependentCounts: {
    affectedBookings: number;
    giftCards: number;
    reviews: number;
    rotationHistory: number;
    therapistPhotos: number;
    therapistServices: number;
    therapistAvailabilities: number;
    therapistZipEligibilities: number;
    customerAddresses: number;
    customerFavorites: number;
    adminNotes: number;
  };
  totalSelectedRecords: number;
  totalAffectedRecords: number;
}

export function DevelopmentDataCleanupSection() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [dataList, setDataList] = useState<CleanupDataList | null>(null);
  const [preview, setPreview] = useState<PreviewCounts | null>(null);

  // Selection states
  const [selectedTherapists, setSelectedTherapists] = useState<Set<string>>(new Set());
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set());
  const [selectedReviews, setSelectedReviews] = useState<Set<string>>(new Set());
  const [selectedTestimonials, setSelectedTestimonials] = useState<Set<string>>(new Set());

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  // Search filters
  const [therapistFilter, setTherapistFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [bookingFilter, setBookingFilter] = useState('');

  const loadDataList = () => {
    setActionError(null);
    startTransition(async () => {
      const res = await getDevelopmentDataListAction();
      if (res.success && res.data) {
        setDataList(res.data);
      } else {
        setActionError(res.error || 'Failed to load development records.');
      }
    });
  };

  useEffect(() => {
    loadDataList();
  }, []);

  const handleToggleSet = (set: Set<string>, id: string, setFn: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFn(next);
    setPreview(null);
  };

  const handleSelectAll = (ids: string[], setFn: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setFn(new Set(ids));
    setPreview(null);
  };

  const handleClearSet = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>) => {
    setFn(new Set());
    setPreview(null);
  };

  const handleGeneratePreview = () => {
    setActionError(null);
    setActionMessage(null);

    startTransition(async () => {
      const res = await previewDevelopmentDataCleanupAction({
        therapistIds: Array.from(selectedTherapists),
        customerIds: Array.from(selectedCustomers),
        bookingIds: Array.from(selectedBookings),
        reviewIds: Array.from(selectedReviews),
        testimonialIds: Array.from(selectedTestimonials),
      });

      if (res.success && res.preview) {
        setPreview(res.preview);
      } else {
        setActionError(res.error || 'Failed to generate cleanup preview.');
      }
    });
  };

  const handleExecuteCleanup = () => {
    if (confirmInput !== 'DELETE DATA') {
      setActionError('Confirmation phrase mismatch.');
      return;
    }

    setActionError(null);
    setActionMessage(null);

    startTransition(async () => {
      const res = await executeDevelopmentDataCleanupAction({
        therapistIds: Array.from(selectedTherapists),
        customerIds: Array.from(selectedCustomers),
        bookingIds: Array.from(selectedBookings),
        reviewIds: Array.from(selectedReviews),
        testimonialIds: Array.from(selectedTestimonials),
        confirmPhrase: confirmInput,
      });

      if (res.success) {
        setActionMessage(res.message || 'Development data cleanup executed successfully.');
        setIsModalOpen(false);
        setConfirmInput('');
        setPreview(null);
        setSelectedTherapists(new Set());
        setSelectedCustomers(new Set());
        setSelectedBookings(new Set());
        setSelectedReviews(new Set());
        setSelectedTestimonials(new Set());
        loadDataList();
        router.refresh();
      } else {
        setActionError(res.error || 'Failed to execute development data cleanup.');
      }
    });
  };

  const totalSelectedCount =
    selectedTherapists.size +
    selectedCustomers.size +
    selectedBookings.size +
    selectedReviews.size +
    selectedTestimonials.size;

  return (
    <div className="bg-slate-900/90 rounded-3xl border border-rose-900/40 p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-md">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 text-[10px] font-black uppercase tracking-wider">
              Super Admin Utility
            </span>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Development Data Cleanup
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Explicitly select operational development records (therapists, customers, bookings, reviews, testimonials) to delete. Protected system entities (admin accounts, services, categories, CMS, and US ZIP master data) remain strictly protected.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={isPending || totalSelectedCount === 0}
            onClick={handleGeneratePreview}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition cursor-pointer disabled:opacity-40 shadow-sm"
          >
            {isPending ? 'Calculating...' : `Preview Cleanup (${totalSelectedCount})`}
          </button>
          <button
            type="button"
            disabled={isPending || totalSelectedCount === 0}
            onClick={() => {
              setIsModalOpen(true);
              setConfirmInput('');
            }}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer disabled:opacity-40 shadow-sm"
          >
            Delete Selected Records
          </button>
        </div>
      </div>

      {/* Banners */}
      {actionMessage && (
        <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-semibold">
          {actionError}
        </div>
      )}

      {/* Selection Grid */}
      {dataList && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Therapists Section */}
          <div className="p-4 rounded-2xl border border-slate-800 bg-slate-950/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Therapists ({dataList.therapists.length})
              </span>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={() => handleSelectAll(dataList.therapists.map((t) => t.id), setSelectedTherapists)}
                  className="text-indigo-400 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  onClick={() => handleClearSet(setSelectedTherapists)}
                  className="text-slate-400 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <input
              type="text"
              placeholder="Search therapist name..."
              value={therapistFilter}
              onChange={(e) => setTherapistFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-800 bg-slate-900 text-slate-200 focus:outline-none"
            />

            <div className="max-h-44 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {dataList.therapists
                .filter((t) => t.name.toLowerCase().includes(therapistFilter.toLowerCase()))
                .map((t) => {
                  const isChecked = selectedTherapists.has(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                        isChecked
                          ? 'bg-rose-950/30 border-rose-500/50 text-white'
                          : 'bg-slate-900/50 border-slate-800/80 text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSet(selectedTherapists, t.id, setSelectedTherapists)}
                          className="rounded border-slate-700 text-rose-600 focus:ring-0"
                        />
                        <span className="font-semibold">{t.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">{t.email || t.phone || 'No contact'}</span>
                    </label>
                  );
                })}
            </div>
          </div>

          {/* Customers Section */}
          <div className="p-4 rounded-2xl border border-slate-800 bg-slate-950/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Customers ({dataList.customers.length})
              </span>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={() => handleSelectAll(dataList.customers.map((c) => c.id), setSelectedCustomers)}
                  className="text-indigo-400 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  onClick={() => handleClearSet(setSelectedCustomers)}
                  className="text-slate-400 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <input
              type="text"
              placeholder="Search customer name or email..."
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-800 bg-slate-900 text-slate-200 focus:outline-none"
            />

            <div className="max-h-44 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {dataList.customers
                .filter(
                  (c) =>
                    c.name.toLowerCase().includes(customerFilter.toLowerCase()) ||
                    c.email.toLowerCase().includes(customerFilter.toLowerCase())
                )
                .map((c) => {
                  const isChecked = selectedCustomers.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                        isChecked
                          ? 'bg-rose-950/30 border-rose-500/50 text-white'
                          : 'bg-slate-900/50 border-slate-800/80 text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSet(selectedCustomers, c.id, setSelectedCustomers)}
                          className="rounded border-slate-700 text-rose-600 focus:ring-0"
                        />
                        <span className="font-semibold">{c.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500">{c.email}</span>
                    </label>
                  );
                })}
            </div>
          </div>

          {/* Bookings Section */}
          <div className="p-4 rounded-2xl border border-slate-800 bg-slate-950/60 space-y-3 md:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Bookings ({dataList.bookings.length})
              </span>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  onClick={() => handleSelectAll(dataList.bookings.map((b) => b.id), setSelectedBookings)}
                  className="text-indigo-400 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-600">|</span>
                <button
                  onClick={() => handleClearSet(setSelectedBookings)}
                  className="text-slate-400 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <input
              type="text"
              placeholder="Search booking number or customer/therapist..."
              value={bookingFilter}
              onChange={(e) => setBookingFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-800 bg-slate-900 text-slate-200 focus:outline-none"
            />

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {dataList.bookings
                .filter(
                  (b) =>
                    b.bookingNumber.toLowerCase().includes(bookingFilter.toLowerCase()) ||
                    b.customerName.toLowerCase().includes(bookingFilter.toLowerCase()) ||
                    b.therapistName.toLowerCase().includes(bookingFilter.toLowerCase())
                )
                .map((b) => {
                  const isChecked = selectedBookings.has(b.id);
                  return (
                    <label
                      key={b.id}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                        isChecked
                          ? 'bg-rose-950/30 border-rose-500/50 text-white'
                          : 'bg-slate-900/50 border-slate-800/80 text-slate-300 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSet(selectedBookings, b.id, setSelectedBookings)}
                          className="rounded border-slate-700 text-rose-600 focus:ring-0"
                        />
                        <span className="font-mono font-bold text-white">{b.bookingNumber}</span>
                        <span className="text-slate-400">{b.customerName} → {b.therapistName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500">{new Date(b.appointmentDateTime).toLocaleDateString()}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">
                          {b.status}
                        </span>
                      </div>
                    </label>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Preview Card */}
      {preview && (
        <div className="p-5 rounded-2xl border border-indigo-500/30 bg-indigo-950/20 text-xs space-y-4">
          <div className="flex items-center justify-between font-bold text-white border-b border-indigo-800/40 pb-3">
            <span>Selected Data Cleanup Preview</span>
            <span className="text-indigo-400 font-mono text-sm">
              {preview.totalAffectedRecords} Total Records Affected ({preview.totalSelectedRecords} Direct + {preview.totalAffectedRecords - preview.totalSelectedRecords} Dependents)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Selected Therapists</span>
              <span className="font-black text-indigo-300 text-base">{preview.selectedCounts.therapists}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Selected Customers</span>
              <span className="font-black text-indigo-300 text-base">{preview.selectedCounts.customers}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Affected Bookings</span>
              <span className="font-black text-indigo-300 text-base">{preview.dependentCounts.affectedBookings}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Dependent Records</span>
              <span className="font-black text-indigo-300 text-base">
                {preview.dependentCounts.giftCards +
                  preview.dependentCounts.reviews +
                  preview.dependentCounts.therapistPhotos +
                  preview.dependentCounts.therapistServices +
                  preview.dependentCounts.therapistAvailabilities +
                  preview.dependentCounts.customerAddresses}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-rose-900/60 text-white">
            <h3 className="text-lg font-bold text-rose-400 border-b border-slate-800 pb-3">
              Confirm Development Data Deletion
            </h3>

            <p className="text-xs text-slate-300 leading-relaxed">
              This action is <strong className="text-rose-400 font-bold">permanently destructive</strong>. The explicitly selected development records and their dependent relational records will be deleted from the database. Protected system accounts, services, categories, CMS content, and master US ZIP data will remain untouched.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                Type <span className="font-mono font-black text-rose-400">DELETE DATA</span> to confirm
              </label>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="DELETE DATA"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-700 font-mono font-bold focus:outline-none focus:ring-1 focus:ring-rose-500 bg-slate-950 text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setConfirmInput('');
                }}
                className="px-4 py-2 font-semibold text-xs rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending || confirmInput !== 'DELETE DATA'}
                onClick={handleExecuteCleanup}
                className="px-5 py-2 font-bold text-xs rounded-xl bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-40 cursor-pointer shadow-lg"
              >
                {isPending ? 'Deleting...' : 'Execute Data Cleanup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Export backward-compatible alias
export const TestDataCleanupSection = DevelopmentDataCleanupSection;
