import React, { Suspense } from 'react';
import { BookingForm } from '@/components/customer/BookingForm';
import { getActiveTherapists } from '@/lib/db-therapists';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const activeTherapists = await getActiveTherapists();

  return (
    <div className="min-h-screen bg-slate-50 py-8 sm:py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Checkout & Booking Details
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            Review your therapist, service options, appointment date/time, and details below to place your booking request.
          </p>
        </div>

        <Suspense fallback={<div className="text-center py-12 text-slate-500">Loading checkout workflow...</div>}>
          <BookingForm activeTherapists={activeTherapists} />
        </Suspense>
      </div>
    </div>
  );
}
