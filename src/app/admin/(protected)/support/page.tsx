import { redirect } from 'next/navigation';
import { getVerifiedAdminSession } from '@/lib/auth-session';
import { SupportManagementClient } from '@/components/admin/SupportManagementClient';

export const metadata = {
  title: 'Support Requests | MASSAF Admin',
  description: 'Manage customer support requests and tickets.',
};

export default async function AdminSupportPage() {
  const session = await getVerifiedAdminSession();
  if (!session) {
    redirect('/admin/login');
  }
  if (session.role === 'STAFF') {
    redirect('/admin/marketer');
  }
  if (session.role === 'MANAGER') {
    redirect('/admin');
  }

  return <SupportManagementClient />;
}
