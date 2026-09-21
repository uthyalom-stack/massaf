import { db } from '@/lib/db';
import { ContentPageLayout } from '@/components/customer/ContentPageLayout';

export const revalidate = 60;

export default async function CancellationPolicyPage() {
  const content = await db.siteContent.findUnique({ where: { key: 'cancellation-policy' } });

  return (
    <ContentPageLayout
      title={content?.title || 'Cancellation & Refund Policy'}
      subtitle="Appointment cancellation terms and refund conditions"
      content={content?.content || 'Appointments cancelled at least 24 hours prior to scheduled start time are eligible for a full refund. Cancellations made within 24 hours may be subject to a cancellation fee.'}
    />
  );
}
