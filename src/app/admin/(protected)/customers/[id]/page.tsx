import React from 'react';
import { notFound, redirect } from 'next/navigation';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { getCustomerDetailsAction } from '@/app/admin/actions';
import { CustomerDetailClient } from '@/components/admin/CustomerDetailClient';

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

  return <CustomerDetailClient customer={res.customer} />;
}
