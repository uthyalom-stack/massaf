'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toggleCustomerActiveAction } from '@/app/admin/actions';
import { AdminNotesSection, SerializedAdminNote } from '@/components/admin/AdminNotesSection';
import { ConfirmModal } from '@/components/admin/ConfirmModal';

export interface CustomerBookingData {
  id: string;
  bookingNumber: string;
  appointmentDateTime: string;
  durationMinutes: number;
  locationType: string;
  status: string;
  amount: number;
  paymentStatus: string;
  paymentMethod: string | null;
  therapistName: string;
  serviceName: string;
  marketingCode: string | null;
}

export interface CustomerReviewData {
  id: string;
  rating: number;
  comment: string | null;
  status: string;
  therapistName: string;
  createdAt: string;
}

export interface CustomerAddressData {
  id: string;
  label: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
}

export interface CustomerDetailData {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive?: boolean;
  createdAt: string;
  addresses: CustomerAddressData[];
  reviews: CustomerReviewData[];
  bookings: CustomerBookingData[];
  internalNotes?: SerializedAdminNote[];
}

interface CustomerDetailClientProps {
  customer: CustomerDetailData;
}

export function CustomerDetailClient({ customer }: CustomerDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [isActive, setIsActive] = useState<boolean>(customer.isActive ?? true);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleToggleActive = () => {
    setIsConfirmModalOpen(false);

    startTransition(async () => {
      const res = await toggleCustomerActiveAction(customer.id, !isActive);
      if (!res.success) {
        setStatusMsg(`✕ ${res.error || 'Failed to update customer status.'}`);
      } else {
        setIsActive(!isActive);
        setStatusMsg(`✓ Customer account ${!isActive ? 'reactivated' : 'deactivated'} successfully.`);
        router.refresh();
      }
    });
  };

  // Find marketing referral codes
  const marketingCodes = Array.from(
    new Set(customer.bookings.map((b) => b.marketingCode).filter(Boolean))
  );

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link href="/admin/customers" className="text-xs font-bold text-emerald-700 hover:underline mb-1 inline-block">
            &larr; Back to Customers Directory
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Customer: {customer.name}
            </h1>
            {isActive ? (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                Active Account
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
                Disabled Account
              </span>
            )}
          </div>
        </div>

        {/* Operational Actions */}
        <div>
          <button
            type="button"
            onClick={() => setIsConfirmModalOpen(true)}
            disabled={isPending}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-colors cursor-pointer ${
              isActive
                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                : 'bg-emerald-700 text-white hover:bg-emerald-800'
            } disabled:opacity-50`}
          >
            {isPending
              ? 'Processing...'
              : isActive
              ? 'Disable Customer Account'
              : 'Restore Customer Account'}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-xl bg-slate-900 text-white text-xs font-semibold">
          {statusMsg}
        </div>
      )}

      {/* Customer Overview Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-slate-400 font-bold uppercase text-[10px] block">Full Name</span>
          <span className="font-bold text-slate-900 text-sm">{customer.name}</span>
        </div>
        <div>
          <span className="text-slate-400 font-bold uppercase text-[10px] block">Email Address</span>
          <span className="font-mono text-slate-900 text-sm">{customer.email}</span>
        </div>
        <div>
          <span className="text-slate-400 font-bold uppercase text-[10px] block">Phone Number</span>
          <span className="font-semibold text-slate-900 text-sm">{customer.phone}</span>
        </div>
        <div>
          <span className="text-slate-400 font-bold uppercase text-[10px] block">Marketing Referral Source</span>
          <span className="font-bold text-emerald-800 text-xs">
            {marketingCodes.length > 0 ? `Code: ${marketingCodes.join(', ')}` : 'Direct / organic'}
          </span>
        </div>
      </div>

      {/* Main Grid: Bookings, Payments & Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Bookings & Payments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Booking History */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-3">
              Bookings & Payments ({customer.bookings.length})
            </h2>

            <div className="space-y-3">
              {customer.bookings.length === 0 ? (
                <p className="text-xs text-slate-400 italic p-4 text-center">No booking history recorded for this customer.</p>
              ) : (
                customer.bookings.map((b) => (
                  <div key={b.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/bookings/${b.id}`} className="font-mono font-bold text-emerald-700 hover:underline">
                          #{b.bookingNumber}
                        </Link>
                        <span className="font-bold text-slate-900">{b.serviceName}</span>
                      </div>
                      <div className="text-slate-600">
                        Date: <strong>{new Date(b.appointmentDateTime).toLocaleDateString()}</strong> • Therapist: <strong>{b.therapistName}</strong>
                      </div>
                      {b.marketingCode && (
                        <div className="text-[10px] text-emerald-700 font-semibold">
                          Attributed Referral Code: {b.marketingCode}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="font-black text-slate-900">${b.amount.toFixed(2)}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        b.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
                      }`}>
                        {b.paymentStatus}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800 uppercase">
                        {b.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Internal Notes Section */}
          <AdminNotesSection
            entityType="CUSTOMER"
            entityId={customer.id}
            notes={customer.internalNotes || []}
          />
        </div>

        {/* Right Column: Saved Addresses & Customer Reviews */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 uppercase tracking-wider">
              Saved Addresses ({customer.addresses.length})
            </h3>
            {customer.addresses.length === 0 ? (
              <p className="text-slate-400 italic">No saved addresses.</p>
            ) : (
              customer.addresses.map((a) => (
                <div key={a.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <strong className="text-slate-900 block">{a.label}</strong>
                  <span className="text-slate-700 block">{a.addressLine1} {a.addressLine2 || ''}</span>
                  <span className="text-slate-500 block">{a.city}, {a.state} {a.zipCode}</span>
                </div>
              ))
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2 uppercase tracking-wider">
              Submitted Reviews ({customer.reviews.length})
            </h3>
            {customer.reviews.length === 0 ? (
              <p className="text-slate-400 italic">No reviews submitted.</p>
            ) : (
              customer.reviews.map((r) => (
                <div key={r.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>{r.therapistName}</span>
                    <span className="text-amber-500">★ {r.rating} / 5</span>
                  </div>
                  <p className="text-slate-700 italic line-clamp-2">&ldquo;{r.comment || 'No comment'}&rdquo;</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={isConfirmModalOpen}
        title={isActive ? 'Disable Customer Account?' : 'Restore Customer Account?'}
        message={
          isActive
            ? `Are you sure you want to disable customer account for ${customer.name} (${customer.email})?`
            : `Are you sure you want to restore customer account for ${customer.name}?`
        }
        confirmText={isActive ? 'Disable Account' : 'Restore Account'}
        cancelText="Cancel"
        isDestructive={isActive}
        isLoading={isPending}
        onConfirm={handleToggleActive}
        onCancel={() => setIsConfirmModalOpen(false)}
      />
    </div>
  );
}
