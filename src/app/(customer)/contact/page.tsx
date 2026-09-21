import { db } from '@/lib/db';
import { ContentPageLayout } from '@/components/customer/ContentPageLayout';

export const revalidate = 60;

export default async function ContactPage() {
  const content = await db.siteContent.findUnique({ where: { key: 'contact' } });

  return (
    <ContentPageLayout
      title={content?.title || 'Contact Us'}
      subtitle="Get in touch with the MASSAF team"
      content={content?.content || 'We are here to help. Reach out to our customer service team for assistance with appointments, platform feedback, or provider inquiries.\n\nEmail: contact@massaf.com'}
    />
  );
}
