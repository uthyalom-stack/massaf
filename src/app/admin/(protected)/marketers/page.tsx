import { getVerifiedAdminSession } from '@/lib/auth-session';
import { listMarketersAction } from '@/app/admin/actions';
import MarketerManagementClient from '@/components/admin/MarketerManagementClient';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Marketer Management | MASSAF Admin',
};

export default async function MarketersPage() {
  const adminSession = await getVerifiedAdminSession();
  if (!adminSession) {
    redirect('/admin/login');
  }

  // Only SUPER_ADMIN and ADMIN can manage marketers
  if (adminSession.role === 'STAFF') {
    redirect('/admin/marketer');
  }

  const res = await listMarketersAction();
  const marketers = res.success && res.marketers ? res.marketers : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Marketers Management</h1>
        <p className="text-sm text-slate-600">
          Create, manage, and view performance for all platform marketing staff.
        </p>
      </div>

      <MarketerManagementClient
        initialMarketers={marketers}
        userRole={adminSession.role || 'ADMIN'}
      />
    </div>
  );
}
