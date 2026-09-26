import { SupportManagementClient } from '@/components/admin/SupportManagementClient';

export const metadata = {
  title: 'Support Requests | MASSAF Admin',
  description: 'Manage customer support requests and tickets.',
};

export default function AdminSupportPage() {
  return <SupportManagementClient />;
}
