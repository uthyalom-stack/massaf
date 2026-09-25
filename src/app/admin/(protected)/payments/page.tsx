import React from 'react';
import { redirect } from 'next/navigation';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { listAllPaymentsAction } from '@/app/admin/actions';
import { PaymentReviewClient } from '@/components/admin/PaymentReviewClient';

export const metadata = {
  title: 'Payments & Financial Operations | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    status?: string;
    search?: string;
  }>;
}

export default async function AdminPaymentsPage({ searchParams }: PageProps) {
  const session = await getVerifiedAdminSession();
  if (!session) redirect('/admin/login');
  if (session.role === 'STAFF') redirect('/admin/marketer');

  const params = await searchParams;
  const statusParam = params.status || 'ALL';
  const searchParam = params.search || '';

  const res = await listAllPaymentsAction(statusParam, searchParam);
  const payments = res.success ? res.payments || [] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Payments & Refunds Console
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Monitor all transactions, inspect gift card proofs, and manage truthful refund workflows.
        </p>
      </div>

      <PaymentReviewClient
        initialPayments={payments}
        currentStatus={statusParam}
        currentSearch={searchParam}
      />
    </div>
  );
}
