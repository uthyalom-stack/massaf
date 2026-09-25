import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { getCustomerDetailsAction } from '@/app/admin/actions';

export const metadata = {
  title: 'Customer Profile | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminCustomerDetailPage({ params }: PageProps) {
  const session = await getVerifiedAdminSession();
  if (!session) redirect('/admin/login');
  if (session.role === 'STAFF') redirect('/admin/marketer');

  const { id } = await params;
  const res = await getCustomerDetailsAction(id);

  if (!res.success || !res.customer) {
    notFound();
  }

  const customer = res.customer;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/customers" className="text-xs font-bold text-emerald-700 hover:underline mb-1 inline-block">
            &larr; Back to Customers Directory
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Customer: {customer.name}
          </h1>
        </div>
      </div>

      {/* Customer Info Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
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
      </div>

      {/* Grid: Bookings & Reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bookings History */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
            Booking History ({customer.bookings.length})
          </h2>

          <div className="space-y-3">
            {customer.bookings.length === 0 ? (
              <p className="text-xs text-slate-400 italic p-4 text-center">No booking history recorded.</p>
            ) : (
              customer.bookings.map((b) => (
                <div key={b.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/bookings/${b.id}`} className="font-mono font-bold text-emerald-700 hover:underline">
                        #{b.bookingNumber}
                      </Link>
                      <span className="font-bold text-slate-900">{b.serviceName}</span>
                    </div>
                    <div className="text-slate-500">
                      Therapist: <strong>{b.therapistName}</strong> • Amount: <strong>${b.amount}</strong> ({b.paymentStatus})
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800">
                    {b.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Saved Addresses & Favorites */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Saved Addresses</h3>
            {customer.addresses.length === 0 ? (
              <p className="text-slate-400 italic">No saved addresses.</p>
            ) : (
              customer.addresses.map((a) => (
                <div key={a.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <strong className="text-slate-900 block">{a.label}</strong>
                  <span className="text-slate-600 block">{a.addressLine1} {a.addressLine2 || ''}</span>
                  <span className="text-slate-500 block">{a.city}, {a.state} {a.zipCode}</span>
                </div>
              ))
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Submitted Reviews ({customer.reviews.length})</h3>
            {customer.reviews.length === 0 ? (
              <p className="text-slate-400 italic">No reviews submitted.</p>
            ) : (
              customer.reviews.map((r) => (
                <div key={r.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span>{r.therapistName}</span>
                    <span className="text-amber-600">★ {r.rating}/5</span>
                  </div>
                  <p className="text-slate-600 italic line-clamp-2">&ldquo;{r.comment || 'No comment'}&rdquo;</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
