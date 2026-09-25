import React from 'react';
import { redirect } from 'next/navigation';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { listAdminUsersAction } from '@/app/admin/actions';
import { AdminUserManagementClient } from '@/components/admin/AdminUserManagementClient';

export const metadata = {
  title: 'Admin User Management | MASSAF Admin',
};

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const session = await getVerifiedAdminSession();
  if (!session) redirect('/admin/login');
  if (session.role !== 'SUPER_ADMIN') redirect('/admin');

  const res = await listAdminUsersAction();
  const users = res.success ? res.users || [] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Admin User Management
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Super Admin Management Console — Manage internal administrator accounts and role privileges.
        </p>
      </div>

      <AdminUserManagementClient
        initialUsers={users}
        currentUserEmail={session.email}
      />
    </div>
  );
}
