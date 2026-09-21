import { db } from '@/lib/db';
import { ContentPageLayout } from '@/components/customer/ContentPageLayout';

export const revalidate = 60;

export default async function SupportPage() {
  const content = await db.siteContent.findUnique({ where: { key: 'support' } });

  return (
    <ContentPageLayout
      title={content?.title || 'Support Center'}
      subtitle="How can we assist you today?"
      content={content?.content || 'MASSAF Customer Support is available to assist you with bookings, therapist inquiries, and appointment scheduling.\n\nContact us directly via email at support@massaf.com or submit a message through our portal.'}
    />
  );
}
