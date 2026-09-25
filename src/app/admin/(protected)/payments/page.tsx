import React from 'react';
import { redirect } from 'next/navigation';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { listGiftCardSubmissionsAction } from '@/app/admin/actions';
import { PaymentReviewClient } from '@/components/admin/PaymentReviewClient';

export const metadata = {
  title: 'Payments & Gift Card Queue | MASSAF Admin',
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

  const res = await listGiftCardSubmissionsAction(statusParam, searchParam);
  const submissions = res.success ? res.submissions || [] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Payments & Gift Card Queue
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Review submitted gift card proofs, verify declared values, and approve payment status.
        </p>
      </div>

      <PaymentReviewClient
        initialSubmissions={submissions}
        currentStatus={statusParam}
        currentSearch={searchParam}
      />
    </div>
  );
}
