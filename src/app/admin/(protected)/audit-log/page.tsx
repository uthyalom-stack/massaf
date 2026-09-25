import React from 'react';
import { redirect } from 'next/navigation';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { listAuditLogsAction } from '@/app/admin/actions';
import { AuditLogClient } from '@/components/admin/AuditLogClient';

export const metadata = {
  title: 'Admin Audit Log | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    search?: string;
    action?: string;
    page?: string;
  }>;
}

export default async function AdminAuditLogPage({ searchParams }: PageProps) {
  const session = await getVerifiedAdminSession();
  if (!session) redirect('/admin/login');
  if (session.role === 'STAFF') redirect('/admin/marketer');

  const params = await searchParams;
  const searchParam = params.search || '';
  const actionParam = params.action || 'ALL';
  const pageParam = parseInt(params.page || '1', 10) || 1;

  const res = await listAuditLogsAction(searchParam, actionParam, pageParam, 30);
  const logs = res.success ? res.logs || [] : [];
  const pagination = res.pagination || { totalCount: 0, page: 1, pageSize: 30, totalPages: 1 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Administrative Audit Log
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Persistent audit record of high-privilege operational changes, security events, and configuration updates.
        </p>
      </div>

      <AuditLogClient
        initialLogs={logs}
        pagination={pagination}
        currentAction={actionParam}
        currentSearch={searchParam}
      />
    </div>
  );
}
