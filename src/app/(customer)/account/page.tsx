import { CustomerDashboardClient } from '@/components/customer/CustomerDashboardClient';

export const metadata = {
  title: 'My Customer Account | MASSAF',
  description: 'Manage your appointments, addresses, profile, and saved massage therapists.',
};

export default function CustomerAccountPage() {
  return <CustomerDashboardClient />;
}
