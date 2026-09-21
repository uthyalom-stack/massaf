import { db } from '@/lib/db';
import { ContentPageLayout } from '@/components/customer/ContentPageLayout';

export const revalidate = 60;

export default async function TermsPage() {
  const content = await db.siteContent.findUnique({ where: { key: 'terms' } });

  return (
    <ContentPageLayout
      title={content?.title || 'Terms of Service'}
      subtitle="Terms and conditions governing the use of MASSAF"
      content={content?.content || 'Welcome to MASSAF. By accessing or using our platform, you agree to comply with and be bound by these Terms of Service. Please review them carefully.'}
    />
  );
}
