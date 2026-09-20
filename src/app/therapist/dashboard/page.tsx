import { TherapistDashboardClient } from '@/components/therapist/TherapistDashboardClient';

export const metadata = {
  title: 'Therapist Portal | MASSAF',
  description: 'Manage your massage appointments, availability schedule, service pricing, service areas, and profile gallery.',
};

export default function TherapistDashboardPage() {
  return <TherapistDashboardClient />;
}
