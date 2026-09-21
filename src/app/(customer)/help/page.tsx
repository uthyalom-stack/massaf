import { db } from '@/lib/db';
import { ContentPageLayout } from '@/components/customer/ContentPageLayout';

export const revalidate = 60;

export default async function HelpPage() {
  const content = await db.siteContent.findUnique({ where: { key: 'help' } });

  return (
    <ContentPageLayout
      title={content?.title || 'Help & FAQs'}
      subtitle="Frequently Asked Questions about MASSAF Wellness & Therapy"
      content={content?.content || 'Find answers to common questions about booking in-home or studio massage therapy sessions, payment processing, cancellation procedures, and therapist qualifications.'}
    />
  );
}
